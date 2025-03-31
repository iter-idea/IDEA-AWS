import * as CognitoIP from '@aws-sdk/client-cognito-identity-provider';
import { CognitoUser, isEmpty } from 'idea-toolbox';

/**
 * A wrapper for AWS Cognito.
 */
export class Cognito {
  client: CognitoIP.CognitoIdentityProviderClient;

  constructor(options: { region?: string } = {}) {
    this.client = new CognitoIP.CognitoIdentityProviderClient({ region: options.region });
  }

  /**
   * Change the region in which to find the user pool.
   * Default: the runner's (e.g. Lambda function) region.
   */
  setRegion(region: string): void {
    // there is no quick way to change the region without re-creating the object
    this.client = new CognitoIP.CognitoIdentityProviderClient({ region });
  }

  /**
   * Get the attributes of the user, from the authorizer claims.
   * @param claims authorizer claims
   * @return user's data
   * @deprecated use idea-toolbox's CognitoUser instead
   */
  getUserByClaims(claims: Record<string, any>): CognitoUserGeneric {
    if (!claims) return null;
    const user: Record<string, any> = {};
    // add any additional cognito attribute available in cognito
    for (const p in claims) if (p.startsWith('cognito:')) user[p.slice(8)] = claims[p];
    // map the important attributes with reserved names
    user.userId = claims.sub;
    user.email = claims.email;
    return user as CognitoUserGeneric;
  }

  /**
   * Map the complex structure returned by Cognito for a user's attributes in a simple key-value object.
   */
  private mapCognitoUserAttributesAsPlainObject(user: Record<string, any>): CognitoUserGeneric {
    const userAttributes: Record<string, any> = {};
    (user.Attributes ?? user.UserAttributes ?? []).forEach((a: any): void => (userAttributes[a.Name] = a.Value));

    if (!userAttributes.userId) userAttributes.userId = userAttributes.sub;
    userAttributes.disabled = !user.Enabled;
    return userAttributes as CognitoUserGeneric;
  }

  //
  // ADMIN
  //

  /**
   * Identify a user by its email address, returning its attributes.
   */
  async getUserByEmail(email: string, userPoolId: string): Promise<CognitoUserGeneric> {
    const command = new CognitoIP.AdminGetUserCommand({ UserPoolId: userPoolId, Username: email });
    try {
      const user = await this.client.send(command);
      return this.mapCognitoUserAttributesAsPlainObject(user);
    } catch (error) {
      if ((error as Error).name === 'UserNotFoundException') throw new Error('User not found');
      throw error;
    }
  }

  /**
   * Identify a user by its userId (sub), returning its attributes.
   */
  async getUserBySub(sub: string, userPoolId: string): Promise<CognitoUserGeneric> {
    // as of today, there is no a direct way to find a user by its sub: we need to run a query against the users base
    const command = new CognitoIP.ListUsersCommand({ UserPoolId: userPoolId, Filter: `sub = "${sub}"`, Limit: 1 });
    const { Users } = await this.client.send(command);
    if (Users.length < 1) throw new Error('User not found');
    return this.mapCognitoUserAttributesAsPlainObject(Users[0]);
  }

  /**
   * Get the list of groups of a user by its email address.
   */
  async getUserGroupsByEmail(email: string, userPoolId: string): Promise<string[]> {
    const command = new CognitoIP.AdminListGroupsForUserCommand({ UserPoolId: userPoolId, Username: email });
    const { Groups } = await this.client.send(command);
    return Groups.map(x => x.GroupName);
  }

  /**
   * List all the users of the pool.
   */
  async listUsers(
    userPoolId: string,
    options: { pagination?: string; users: CognitoUser[] } = { users: [] }
  ): Promise<CognitoUser[]> {
    const params: CognitoIP.ListUsersCommandInput = { UserPoolId: userPoolId };
    if (options.pagination) params.PaginationToken = options.pagination;

    const { Users, PaginationToken: pagination } = await this.client.send(new CognitoIP.ListUsersCommand(params));

    const users = options.users.concat(Users.map(u => new CognitoUser(this.mapCognitoUserAttributesAsPlainObject(u))));

    if (pagination) return await this.listUsers(userPoolId, { pagination, users });
    else return users;
  }
  /**
   * List all the users of the pool, including the information about the groups they're in.
   * Note: it's slower than the alternative `listUsers`: use it only when needed.
   */
  async listUsersWithGroupsDetail(cognitoUserPoolId: string): Promise<CognitoUser[]> {
    const [users, groups] = await Promise.all([this.listUsers(cognitoUserPoolId), this.listGroups(cognitoUserPoolId)]);

    await Promise.all(
      groups.map(async group => {
        const usersOfGroup = await this.listUsersInGroup(group.name, cognitoUserPoolId);
        usersOfGroup.forEach(userInGroup => {
          const userAlreadyInOutputList = users.find(u => u.userId === userInGroup.userId);
          if (userAlreadyInOutputList) userAlreadyInOutputList.groups.push(group.name);
        });
      })
    );

    return users;
  }

  /**
   * Create a new user (by its email) in the pool specified.
   * @return userId of the new user
   */
  async createUser(
    cognitoUserOrEmail: CognitoUser | string,
    userPoolId: string,
    options: CreateUserOptions = {}
  ): Promise<string> {
    const email =
      typeof cognitoUserOrEmail === 'string'
        ? (cognitoUserOrEmail as string)
        : (cognitoUserOrEmail as CognitoUser).email;

    if (isEmpty(email, 'email')) throw new Error('INVALID_EMAIL');

    const UserAttributes = [
      { Name: 'email', Value: email },
      { Name: 'email_verified', Value: 'true' }
    ];

    if (typeof cognitoUserOrEmail === 'object') {
      const user = cognitoUserOrEmail as CognitoUser;

      UserAttributes.push({ Name: 'name', Value: user.name });
      UserAttributes.push({ Name: 'picture', Value: user.picture || '' });

      Object.keys(user.attributes).forEach(a =>
        UserAttributes.push({ Name: 'custom:'.concat(a), Value: String(user.attributes[a]) })
      );
    }

    const params: CognitoIP.AdminCreateUserCommandInput = { UserPoolId: userPoolId, Username: email, UserAttributes };
    if (options.skipNotification) params.MessageAction = 'SUPPRESS';
    if (options.temporaryPassword) params.TemporaryPassword = options.temporaryPassword;

    const { User } = await this.client.send(new CognitoIP.AdminCreateUserCommand(params));

    const userId = this.mapCognitoUserAttributesAsPlainObject(User).sub;

    if (!userId) throw new Error('Creation failed');
    return userId as string;
  }

  /**
   * Resend the password to a user who never logged in.
   */
  async resendPassword(email: string, userPoolId: string, options: CreateUserOptions = {}): Promise<void> {
    if (isEmpty(email, 'email')) throw new Error('Invalid email');

    const params: CognitoIP.AdminCreateUserCommandInput = {
      UserPoolId: userPoolId,
      Username: email,
      MessageAction: 'RESEND'
    };
    if (options.temporaryPassword) params.TemporaryPassword = options.temporaryPassword;

    await this.client.send(new CognitoIP.AdminCreateUserCommand(params));
  }

  /**
   * Set a new password for a specific user identified by its email (admin-only).
   * If not specified, the password is generated randomly, and the user must change it at the first login.
   */
  async setPassword(
    email: string,
    userPoolId: string,
    options: { password?: string; permanent?: boolean } = {}
  ): Promise<void> {
    if (isEmpty(email, 'email')) throw new Error('Invalid email');

    const RANDOM_PASSWORD_LENGTH = 8;
    const password =
      options.password ??
      Math.random()
        .toString(36)
        .slice(2, 2 + RANDOM_PASSWORD_LENGTH);

    const params: CognitoIP.AdminSetUserPasswordCommandInput = {
      UserPoolId: userPoolId,
      Username: email,
      Password: password,
      Permanent: options.permanent
    };

    await this.client.send(new CognitoIP.AdminSetUserPasswordCommand(params));
  }

  /**
   * Delete a user by its email (username), in the pool specified.
   */
  async deleteUser(email: string, userPoolId: string): Promise<void> {
    if (isEmpty(email, 'email')) throw new Error('Invalid email');

    const command = new CognitoIP.AdminDeleteUserCommand({ UserPoolId: userPoolId, Username: email });
    await this.client.send(command);
  }

  //
  // USER
  //

  /**
   * Sign in a user of a specific pool through username and password.
   */
  async signIn(
    email: string,
    password: string,
    userPoolId: string,
    userPoolClientId: string
  ): Promise<CognitoIP.AuthenticationResultType> {
    const command = new CognitoIP.AdminInitiateAuthCommand({
      UserPoolId: userPoolId,
      ClientId: userPoolClientId,
      AuthFlow: 'ADMIN_NO_SRP_AUTH',
      AuthParameters: { USERNAME: email, PASSWORD: password }
    });
    const { AuthenticationResult } = await this.client.send(command);

    if (!AuthenticationResult) throw new Error('Sign-in failed');
    return AuthenticationResult;
  }

  /**
   * Given a username and a refresh token (and pool data), refresh the session and return the new tokens.
   */
  async refreshSession(
    email: string,
    refreshToken: string,
    userPoolId: string,
    userPoolClientId: string
  ): Promise<CognitoIP.AuthenticationResultType> {
    const command = new CognitoIP.AdminInitiateAuthCommand({
      UserPoolId: userPoolId,
      ClientId: userPoolClientId,
      AuthFlow: 'REFRESH_TOKEN_AUTH',
      AuthParameters: { USERNAME: email, REFRESH_TOKEN: refreshToken }
    });
    const { AuthenticationResult } = await this.client.send(command);

    if (!AuthenticationResult) throw new Error('Refresh failed');
    return AuthenticationResult;
  }

  /**
   * Change the email address (== username) associated to a user.
   */
  async updateEmail(email: string, newEmail: string, userPoolId: string, globalSignOut = false): Promise<void> {
    if (isEmpty(newEmail, 'email')) throw new Error('Invalid new email');

    const command = new CognitoIP.AdminUpdateUserAttributesCommand({
      UserPoolId: userPoolId,
      Username: email,
      UserAttributes: [
        { Name: 'email', Value: newEmail },
        { Name: 'email_verified', Value: 'true' }
      ]
    });
    await this.client.send(command);

    // sign out the user from all its devices
    if (globalSignOut) await this.globalSignOut(newEmail, userPoolId);
  }
  /**
   * Verify the email address (== username) associated to a user.
   */
  async verifyEmail(email: string, userPoolId: string, unverify = false): Promise<void> {
    const command = new CognitoIP.AdminUpdateUserAttributesCommand({
      UserPoolId: userPoolId,
      Username: email,
      UserAttributes: [{ Name: 'email_verified', Value: unverify ? 'false' : 'true' }]
    });
    await this.client.send(command);
  }

  /**
   * Change the password to sign in for a user.
   */
  async updatePassword(
    email: string,
    oldPassword: string,
    newPassword: string,
    userPoolId: string,
    userPoolClientId: string
  ): Promise<void> {
    if (newPassword.length < 8) throw new Error('Invalid new password');

    const tokensForPasswordChange = await this.signIn(email, oldPassword, userPoolId, userPoolClientId);

    const command = new CognitoIP.ChangePasswordCommand({
      AccessToken: tokensForPasswordChange.AccessToken,
      PreviousPassword: oldPassword,
      ProposedPassword: newPassword
    });
    await this.client.send(command);
  }

  /**
   * Send to a user the instructions to change the password.
   */
  async forgotPassword(email: string, userPoolClientId: string): Promise<CognitoIP.CodeDeliveryDetailsType> {
    const command = new CognitoIP.ForgotPasswordCommand({ Username: email, ClientId: userPoolClientId });
    const { CodeDeliveryDetails } = await this.client.send(command);
    return CodeDeliveryDetails;
  }
  /**
   * Complete the flow of a password forgot.
   */
  async confirmForgotPassword(
    email: string,
    newPassword: string,
    confirmationCode: string,
    userPoolClientId: string
  ): Promise<void> {
    const command = new CognitoIP.ConfirmForgotPasswordCommand({
      ClientId: userPoolClientId,
      Username: email,
      ConfirmationCode: confirmationCode,
      Password: newPassword
    });
    await this.client.send(command);
  }

  /**
   * Update a (Cognito)User's attributes, excluding the attributes that require specific methods.
   */
  async updateUser(user: CognitoUser, userPoolId: string): Promise<void> {
    const UserAttributes = [
      { Name: 'name', Value: user.name },
      { Name: 'picture', Value: user.picture ?? '' }
    ];

    Object.keys(user.attributes).forEach(customAttribute =>
      UserAttributes.push({
        Name: 'custom:'.concat(customAttribute),
        Value: String(user.attributes[customAttribute])
      })
    );

    const command = new CognitoIP.AdminUpdateUserAttributesCommand({
      UserPoolId: userPoolId,
      Username: user.email,
      UserAttributes
    });
    await this.client.send(command);
  }

  /**
   * Disable a cognito user.
   */
  async disableUser(email: string, userPoolId: string): Promise<void> {
    const command = new CognitoIP.AdminDisableUserCommand({ UserPoolId: userPoolId, Username: email });
    await this.client.send(command);
  }
  /**
   * Enable a cognito user.
   */
  async enableUser(email: string, userPoolId: string): Promise<void> {
    const command = new CognitoIP.AdminEnableUserCommand({ UserPoolId: userPoolId, Username: email });
    await this.client.send(command);
  }

  /**
   * Sign out the user from all devices.
   */
  async globalSignOut(email: string, userPoolId: string): Promise<void> {
    const command = new CognitoIP.AdminUserGlobalSignOutCommand({ Username: email, UserPoolId: userPoolId });
    await this.client.send(command);
  }

  /**
   * Confirm and conclude a registration, usign a confirmation code.
   */
  async confirmSignUp(email: string, confirmationCode: string, userPoolClientId: string): Promise<void> {
    if (!email) throw new Error('Invalid email');
    if (!confirmationCode) throw new Error('Invalid confirmation code');
    if (!userPoolClientId) throw new Error('Invalid client ID');

    const command = new CognitoIP.ConfirmSignUpCommand({
      Username: email,
      ConfirmationCode: confirmationCode,
      ClientId: userPoolClientId
    });
    await this.client.send(command);
  }

  /**
   * List the groups of the user pool.
   */
  async listGroups(
    userPoolId: string,
    options: { pagination?: string; groups: CognitoGroup[] } = { groups: [] }
  ): Promise<CognitoGroup[]> {
    const params: CognitoIP.ListGroupsRequest = { UserPoolId: userPoolId };
    if (options.pagination) params.NextToken = options.pagination;

    const res = await this.client.send(new CognitoIP.ListGroupsCommand(params));

    const pagination = res.NextToken;
    const groups = options.groups.concat(
      res.Groups.map(g => ({ name: g.GroupName, description: g.Description } as CognitoGroup))
    );

    if (pagination) return await this.listGroups(userPoolId, { pagination, groups });
    else return groups;
  }
  /**
   * Create a new group in the user pool.
   */
  async createGroup(groupName: string, userPoolId: string): Promise<void> {
    const command = new CognitoIP.CreateGroupCommand({ GroupName: groupName, UserPoolId: userPoolId });
    await this.client.send(command);
  }
  /**
   * Delete a group from the user pool.
   */
  async deleteGroup(groupName: string, userPoolId: string): Promise<void> {
    const command = new CognitoIP.DeleteGroupCommand({ GroupName: groupName, UserPoolId: userPoolId });
    await this.client.send(command);
  }

  /**
   * List the users part of a group in the user pool.
   */
  async listUsersInGroup(
    group: string,
    userPoolId: string,
    options: { pagination?: string; users: CognitoUser[] } = { users: [] }
  ): Promise<CognitoUser[]> {
    const params: CognitoIP.ListUsersInGroupRequest = {
      UserPoolId: userPoolId,
      GroupName: group
    };
    if (options.pagination) params.NextToken = options.pagination;

    const res = await this.client.send(new CognitoIP.ListUsersInGroupCommand(params));

    const pagination = res.NextToken;
    const users = options.users.concat(
      res.Users.map(u => new CognitoUser(this.mapCognitoUserAttributesAsPlainObject(u)))
    );

    if (pagination) return await this.listUsersInGroup(group, userPoolId, { pagination, users });
    else return users;
  }
  /**
   * Add a user (by email) to a group in the user pool.
   */
  async addUserToGroup(email: string, group: string, userPoolId: string): Promise<void> {
    const user = new CognitoUser(await this.getUserByEmail(email, userPoolId));

    const command = new CognitoIP.AdminAddUserToGroupCommand({
      UserPoolId: userPoolId,
      GroupName: group,
      Username: user.userId
    });
    await this.client.send(command);
  }
  /**
   * Remove a user (by email) from a group in the user pool.
   */
  async removeUserFromGroup(email: string, group: string, userPoolId: string): Promise<void> {
    const user = new CognitoUser(await this.getUserByEmail(email, userPoolId));

    const command = new CognitoIP.AdminRemoveUserFromGroupCommand({
      UserPoolId: userPoolId,
      GroupName: group,
      Username: user.userId
    });
    await this.client.send(command);
  }
}

/**
 * The attributes of a generic Cognito user of which we don't know the custom attributes.
 */
export interface CognitoUserGeneric {
  /**
   * The user id (sub).
   */
  userId: string;
  /**
   * The email (=== username).
   */
  email: string;
  /**
   * Whether the user has been disabled.
   */
  disabled: boolean;
  /**
   * Cognito can have custom attributes.
   */
  [attribute: string]: string | number | boolean;
}

/**
 * Options when creating a new user.
 */
export interface CreateUserOptions {
  /**
   * Uf true, don't send the default Cognito email notification
   */
  skipNotification?: boolean;
  /**
   * If null, randomly generated
   */
  temporaryPassword?: string;
}

/**
 * The attributes of a Cognito group.
 */
export interface CognitoGroup {
  /**
   * The name (and id) of the group.
   */
  name: string;
  /**
   * The description of the group.
   */
  description: string;
}
