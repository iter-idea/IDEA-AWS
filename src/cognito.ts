import { CognitoIdentityServiceProvider } from 'aws-sdk';
import { CognitoUser, isEmpty } from 'idea-toolbox';

/**
 * A wrapper for AWS Cognito.
 */
export class Cognito {
  protected cognito: CognitoIdentityServiceProvider;

  constructor(params: { region?: string } = {}) {
    this.cognito = new CognitoIdentityServiceProvider({ apiVersion: '2016-04-18', region: params.region });
  }

  /**
   * Change the region in which to find the user pool.
   * Default: the runner's (e.g. Lambda function) region.
   */
  setRegion(region: string) {
    // there is no quick way to change the region without re-creating the object
    this.cognito = new CognitoIdentityServiceProvider({ apiVersion: this.cognito.config.apiVersion, region });
  }

  /**
   * Get the attributes of the user, from the authorizer claims.
   * @param claims authorizer claims
   * @return user's data
   * @deprecated use IdeaX.CognitoUser instead
   */
  getUserByClaims(claims: any): CognitoUserGeneric {
    if (!claims) return null;
    const user: any = {};
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
  private mapCognitoUserAttributesAsPlainObject(user: any): CognitoUserGeneric {
    const userAttributes: any = {};
    (user.Attributes || user.UserAttributes || []).forEach((a: any) => (userAttributes[a.Name] = a.Value));
    return userAttributes as CognitoUserGeneric;
  }

  /**
   * Identify a user by its email address, returning its attributes.
   */
  async getUserByEmail(email: string, cognitoUserPoolId: string): Promise<CognitoUserGeneric> {
    const user = await this.cognito.adminGetUser({ UserPoolId: cognitoUserPoolId, Username: email }).promise();
    if (!user) throw new Error('User not found');

    return this.mapCognitoUserAttributesAsPlainObject(user);
  }

  /**
   * Identify a user by its userId (sub), returning its attributes.
   */
  async getUserBySub(sub: string, cognitoUserPoolId: string): Promise<CognitoUserGeneric> {
    // as of today, there is no a direct way to find a user by its sub: we need to run a query against the users base
    const usersList = await this.cognito
      .listUsers({ UserPoolId: cognitoUserPoolId, Filter: `sub = "${sub}"`, Limit: 1 })
      .promise();
    const user = usersList?.Users[0];
    if (!user) throw new Error('User not found');

    return this.mapCognitoUserAttributesAsPlainObject(user);
  }

  /**
   * Get all the users of the pool.
   */
  async getAllUsers(
    cognitoUserPoolId: string,
    options: { pagination?: string; users: CognitoUser[] } = { users: [] }
  ): Promise<CognitoUser[]> {
    const params: CognitoIdentityServiceProvider.ListUsersRequest = { UserPoolId: cognitoUserPoolId };
    if (options.pagination) params.PaginationToken = options.pagination;

    const res = await this.cognito.listUsers(params).promise();

    const pagination = res.PaginationToken;
    const users = options.users.concat(
      res.Users.map(u => new CognitoUser(this.mapCognitoUserAttributesAsPlainObject(u)))
    );

    if (pagination) return await this.getAllUsers(cognitoUserPoolId, { pagination, users });
    else return users;
  }

  /**
   * Create a new user (by its email) in the pool specified.
   * @return userId of the new user
   */
  async createUser(
    cognitoUserOrEmail: CognitoUser | string,
    cognitoUserPoolId: string,
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

    const params: CognitoIdentityServiceProvider.AdminCreateUserRequest = {
      UserPoolId: cognitoUserPoolId,
      Username: email,
      UserAttributes
    };
    if (options.skipNotification) params.MessageAction = 'SUPPRESS';
    if (options.temporaryPassword) params.TemporaryPassword = options.temporaryPassword;

    const result = await this.cognito.adminCreateUser(params).promise();

    const userId = this.mapCognitoUserAttributesAsPlainObject(result.User).sub;

    if (userId) return userId;
    else throw new Error('Creation failed');
  }

  /**
   * Resend the password to a user who never logged in.
   */
  async resendPassword(email: string, cognitoUserPoolId: string, options: CreateUserOptions = {}): Promise<void> {
    if (isEmpty(email, 'email')) throw new Error('Invalid email');

    const params: CognitoIdentityServiceProvider.AdminCreateUserRequest = {
      UserPoolId: cognitoUserPoolId,
      Username: email,
      MessageAction: 'RESEND'
    };
    if (options.temporaryPassword) params.TemporaryPassword = options.temporaryPassword;

    await this.cognito.adminCreateUser(params).promise();
  }

  /**
   * Delete a user by its email (username), in the pool specified.
   */
  async deleteUser(email: string, cognitoUserPoolId: string): Promise<void> {
    if (isEmpty(email, 'email')) throw new Error('Invalid email');

    await this.cognito.adminDeleteUser({ UserPoolId: cognitoUserPoolId, Username: email }).promise();
  }

  /**
   * Sign in a user of a specific pool through username and password.
   */
  async signIn(
    email: string,
    password: string,
    cognitoUserPoolId: string,
    cognitoUserPoolClientId: string
  ): Promise<CognitoIdentityServiceProvider.AuthenticationResultType> {
    const result = await this.cognito
      .adminInitiateAuth({
        UserPoolId: cognitoUserPoolId,
        ClientId: cognitoUserPoolClientId,
        AuthFlow: 'ADMIN_NO_SRP_AUTH',
        AuthParameters: { USERNAME: email, PASSWORD: password }
      })
      .promise();

    if (result?.AuthenticationResult) return result.AuthenticationResult;
    else throw new Error('Sign-in failed');
  }

  /**
   * Given a username and a refresh token (and pool data), refresh the session and return the new tokens.
   */
  async refreshSession(
    email: string,
    refreshToken: string,
    cognitoUserPoolId: string,
    cognitoUserPoolClientId: string
  ): Promise<CognitoIdentityServiceProvider.AuthenticationResultType> {
    const result = await this.cognito
      .adminInitiateAuth({
        UserPoolId: cognitoUserPoolId,
        ClientId: cognitoUserPoolClientId,
        AuthFlow: 'REFRESH_TOKEN_AUTH',
        AuthParameters: { USERNAME: email, REFRESH_TOKEN: refreshToken }
      })
      .promise();

    if (result?.AuthenticationResult) return result.AuthenticationResult;
    else throw new Error('Refresh failed');
  }

  /**
   * Change the email address (== username) associated to a user.
   */
  async updateEmail(email: string, newEmail: string, cognitoUserPoolId: string): Promise<void> {
    if (isEmpty(newEmail, 'email')) throw new Error('Invalid new email');

    await this.cognito
      .adminUpdateUserAttributes({
        UserPoolId: cognitoUserPoolId,
        Username: email,
        UserAttributes: [
          { Name: 'email', Value: newEmail },
          { Name: 'email_verified', Value: 'true' }
        ]
      })
      .promise();

    // sign out the user from all its devices and resolve
    await this.globalSignOut(newEmail, cognitoUserPoolId);
  }

  /**
   * Change the password to sign in for a user.
   */
  async updatePassword(
    email: string,
    oldPassword: string,
    newPassword: string,
    cognitoUserPoolId: string,
    cognitoUserPoolClientId: string
  ): Promise<void> {
    if (newPassword.length < 8) throw new Error('Invalid new password');

    const tokensForPasswordChange = await this.signIn(email, oldPassword, cognitoUserPoolId, cognitoUserPoolClientId);

    await this.cognito
      .changePassword({
        AccessToken: tokensForPasswordChange.AccessToken,
        PreviousPassword: oldPassword,
        ProposedPassword: newPassword
      })
      .promise();
  }

  /**
   * Update a (Cognito)User's attributes, excluding the attributes that require specific methods.
   */
  async updateUser(user: CognitoUser, cognitoUserPoolId: string): Promise<void> {
    const UserAttributes = [
      { Name: 'name', Value: user.name },
      { Name: 'picture', Value: user.picture || '' }
    ];

    Object.keys(user.attributes).forEach(customAttribute =>
      UserAttributes.push({
        Name: 'custom:'.concat(customAttribute),
        Value: String(user.attributes[customAttribute])
      })
    );

    await this.cognito
      .adminUpdateUserAttributes({ UserPoolId: cognitoUserPoolId, Username: user.email, UserAttributes })
      .promise();
  }

  /**
   * Sign out the user from all devices.
   */
  async globalSignOut(email: string, cognitoUserPoolId: string): Promise<void> {
    await this.cognito.adminUserGlobalSignOut({ Username: email, UserPoolId: cognitoUserPoolId }).promise();
  }

  /**
   * Confirm and conclude a registration, usign a confirmation code.
   */
  async confirmSignUp(email: string, confirmationCode: string, cognitoUserPoolClientId: string): Promise<void> {
    if (!email) throw new Error('Invalid email');
    if (!confirmationCode) throw new Error('Invalid confirmation code');
    if (!cognitoUserPoolClientId) throw new Error('Invalid client ID');

    await this.cognito
      .confirmSignUp({ Username: email, ConfirmationCode: confirmationCode, ClientId: cognitoUserPoolClientId })
      .promise();
  }

  /**
   * List the groups of the user pool.
   */
  async listGroups(cognitoUserPoolId: string): Promise<CognitoGroup[]> {
    const groupsList = await this.cognito.listGroups({ UserPoolId: cognitoUserPoolId }).promise();

    const groups: CognitoGroup[] = groupsList.Groups.map(g => ({ name: g.GroupName, description: g.Description }));
    return groups;
  }
  /**
   * Create a new group in the user pool.
   */
  async createGroup(groupName: string, cognitoUserPoolId: string): Promise<void> {
    await this.cognito.createGroup({ GroupName: groupName, UserPoolId: cognitoUserPoolId }).promise();
  }
  /**
   * Delete a group from the user pool.
   */
  async deleteGroup(groupName: string, cognitoUserPoolId: string): Promise<void> {
    await this.cognito.deleteGroup({ GroupName: groupName, UserPoolId: cognitoUserPoolId }).promise();
  }

  /**
   * List the users part of a group in the user pool.
   */
  async listUsersInGroup(group: string, cognitoUserPoolId: string): Promise<CognitoUser[]> {
    const usersInGroupList = await this.cognito
      .listUsersInGroup({ UserPoolId: cognitoUserPoolId, GroupName: group })
      .promise();

    const users = usersInGroupList.Users.map(u => new CognitoUser(this.mapCognitoUserAttributesAsPlainObject(u)));
    return users;
  }
  /**
   * Add a user (by email) to a group in the user pool.
   */
  async addUserToGroup(email: string, group: string, cognitoUserPoolId: string): Promise<void> {
    const user = new CognitoUser(await this.getUserByEmail(email, cognitoUserPoolId));

    await this.cognito
      .adminAddUserToGroup({ UserPoolId: cognitoUserPoolId, GroupName: group, Username: user.userId })
      .promise();
  }
  /**
   * Remove a user (by email) from a group in the user pool.
   */
  async removeUserFromGroup(email: string, group: string, cognitoUserPoolId: string): Promise<void> {
    const user = new CognitoUser(await this.getUserByEmail(email, cognitoUserPoolId));

    await this.cognito
      .adminRemoveUserFromGroup({ UserPoolId: cognitoUserPoolId, GroupName: group, Username: user.userId })
      .promise();
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
   * Cognito can have custom attributes.
   */
  [attribute: string]: string;
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
