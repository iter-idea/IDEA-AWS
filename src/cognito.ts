import { CognitoIdentityServiceProvider } from 'aws-sdk';
import { isEmpty, logger, User } from 'idea-toolbox';

/**
 * A wrapper for AWS Cognito.
 */
export class Cognito {
  protected cognito: CognitoIdentityServiceProvider;

  constructor() {
    this.cognito = new CognitoIdentityServiceProvider({ apiVersion: '2016-04-18' });
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
   */
  getUserByClaims(claims: any): CognitoUserData {
    if (!claims) return null;
    const user: CognitoUserData | any = {};
    // add any additional cognito attribute available in cognito
    for (const p in claims) if (p.startsWith('cognito:')) user[p.slice(8)] = claims[p];
    // map the important attributes with reserved names
    user.userId = claims.sub;
    user.email = claims.email;
    return user;
  }

  /**
   * Identify a user by its email address, returning its attributes.
   */
  getUserByEmail(email: string, cognitoUserPoolId: string): Promise<CognitoUserData> {
    return new Promise((resolve, reject) => {
      // find the user by the email
      this.cognito.adminGetUser(
        { UserPoolId: cognitoUserPoolId, Username: email },
        (err: Error, data: CognitoIdentityServiceProvider.AdminGetUserResponse) => {
          if (err || !data) reject(err);
          else {
            // convert and return the attributes
            const userAttributes: CognitoUserData | any = {};
            data.UserAttributes.forEach((a: any) => (userAttributes[a.Name] = a.Value));
            resolve(userAttributes);
          }
        }
      );
    });
  }

  /**
   * Identify a user by its userId (sub), returning its attributes.
   */
  getUserBySub(sub: string, cognitoUserPoolId: string): Promise<CognitoUserData> {
    return new Promise((resolve, reject) => {
      // find the user by the sub
      this.cognito.listUsers(
        { UserPoolId: cognitoUserPoolId, Filter: `sub = "${sub}"`, Limit: 1 },
        (err: Error, data: CognitoIdentityServiceProvider.ListUsersResponse) => {
          if (err || !data || !data.Users || !data.Users[0]) reject(err);
          else {
            // convert and return the attributes
            const userAttributes: any = {};
            data.Users[0].Attributes.forEach((a: any) => (userAttributes[a.Name] = a.Value));
            resolve(userAttributes);
          }
        }
      );
    });
  }

  /**
   * Create a new user (by its email) in the pool specified.
   * @return userId of the new user
   */
  createUser(email: string, cognitoUserPoolId: string, options?: CreateUserOptions): Promise<string> {
    return new Promise((resolve, reject) => {
      options = options || {};
      if (isEmpty(email, 'email')) return reject(new Error('INVALID_EMAIL'));
      const attributes = [
        { Name: 'email', Value: email },
        { Name: 'email_verified', Value: 'true' }
      ];
      const params: CognitoIdentityServiceProvider.AdminCreateUserRequest = {
        UserPoolId: cognitoUserPoolId,
        Username: email,
        UserAttributes: attributes
      };
      if (options.skipNotification) params.MessageAction = 'SUPPRESS';
      if (options.temporaryPassword) params.TemporaryPassword = options.temporaryPassword;
      this.cognito.adminCreateUser(
        params,
        (err: Error, data: CognitoIdentityServiceProvider.AdminCreateUserResponse) => {
          logger('COGNITO CREATE USER', err);
          if (err)
            switch (err.name) {
              case 'UsernameExistsException':
                return reject(new Error('USERNAME_ALREADY_EXISTS'));
              case 'InvalidPasswordException':
                return reject(new Error('INVALID_PASSWORD'));
              default:
                return reject(err);
            }
          const userId = data.User.Attributes.find((attr: any) => attr.Name === 'sub').Value || null;
          if (userId) resolve(userId);
          else reject(new Error('CREATION_FAILED'));
        }
      );
    });
  }

  /**
   * Resend the password to a user who never logged in.
   */
  resendPassword(email: string, cognitoUserPoolId: string, options?: CreateUserOptions): Promise<void> {
    return new Promise((resolve, reject) => {
      options = options || {};
      if (isEmpty(email, 'email')) return reject(new Error('INVALID_EMAIL'));
      const params: CognitoIdentityServiceProvider.AdminCreateUserRequest = {
        UserPoolId: cognitoUserPoolId,
        Username: email,
        MessageAction: 'RESEND'
      };
      if (options.temporaryPassword) params.TemporaryPassword = options.temporaryPassword;
      this.cognito.adminCreateUser(params, (err: Error) => {
        logger('COGNITO RESEND PASSWORD', err);
        if (err)
          switch (err.name) {
            case 'UnsupportedUserStateException':
              return reject(new Error('USER_ALREADY_CONFIRMED_PASSWORD'));
            default:
              return reject(err);
          }
        else resolve();
      });
    });
  }

  /**
   * Delete a user by its email (username), in the pool specified.
   */
  deleteUser(email: string, cognitoUserPoolId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (isEmpty(email, 'email')) return reject(new Error('INVALID_EMAIL'));
      this.cognito.adminDeleteUser({ UserPoolId: cognitoUserPoolId, Username: email }, (err: Error) => {
        logger('COGNITO DELETE USER', err);
        if (err) reject(new Error('DELETION_FAILED'));
        else resolve();
      });
    });
  }

  /**
   * Sign in a user of a specific pool through username and password.
   */
  signIn(
    email: string,
    password: string,
    cognitoUserPoolId: string,
    cognitoUserPoolClientId: string
  ): Promise<CognitoIdentityServiceProvider.AuthenticationResultType> {
    return new Promise((resolve, reject) => {
      this.cognito.adminInitiateAuth(
        {
          UserPoolId: cognitoUserPoolId,
          ClientId: cognitoUserPoolClientId,
          AuthFlow: 'ADMIN_NO_SRP_AUTH',
          AuthParameters: { USERNAME: email, PASSWORD: password }
        },
        (err: Error, data: CognitoIdentityServiceProvider.AdminInitiateAuthResponse) => {
          logger('COGNITO SIGN IN', err);
          if (err || !data.AuthenticationResult) reject(err);
          else resolve(data.AuthenticationResult);
        }
      );
    });
  }

  /**
   * Given a username and a refresh token (and pool data), refresh the session and return the new tokens.
   */
  refreshSession(
    email: string,
    refreshToken: string,
    cognitoUserPoolId: string,
    cognitoUserPoolClientId: string
  ): Promise<CognitoIdentityServiceProvider.AuthenticationResultType> {
    return new Promise((resolve, reject) => {
      this.cognito.adminInitiateAuth(
        {
          UserPoolId: cognitoUserPoolId,
          ClientId: cognitoUserPoolClientId,
          AuthFlow: 'REFRESH_TOKEN_AUTH',
          AuthParameters: { USERNAME: email, REFRESH_TOKEN: refreshToken }
        },
        (err: Error, data: CognitoIdentityServiceProvider.AdminInitiateAuthResponse) => {
          logger('COGNITO REFRESH TOKEN', err);
          if (err || !data.AuthenticationResult) reject(err);
          else resolve(data.AuthenticationResult);
        }
      );
    });
  }

  /**
   * Change the email address (== username) associated to a user.
   */
  updateEmail(email: string, newEmail: string, cognitoUserPoolId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (isEmpty(newEmail, 'email')) return reject(new Error('INVALID_NEW_EMAIL'));
      this.cognito.adminUpdateUserAttributes(
        {
          UserPoolId: cognitoUserPoolId,
          Username: email,
          UserAttributes: [
            { Name: 'email', Value: newEmail },
            { Name: 'email_verified', Value: 'true' }
          ]
        },
        (err: Error) => {
          logger('COGNITO UPDATE EMAIL', err);
          if (err) reject(err);
          // sign out the user from all its devices and resolve
          else
            this.globalSignOut(newEmail, cognitoUserPoolId)
              .then(() => resolve())
              .catch(e => reject(e));
        }
      );
    });
  }

  /**
   * Change the password to sign in for a user.
   */
  updatePassword(
    email: string,
    oldPassword: string,
    newPassword: string,
    cognitoUserPoolId: string,
    cognitoUserPoolClientId: string
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      if (newPassword.length < 8) return reject(new Error('INVALID_NEW_PASSWORD'));
      // get a token to run the password change
      this.signIn(email, oldPassword, cognitoUserPoolId, cognitoUserPoolClientId)
        .then((data: CognitoIdentityServiceProvider.AuthenticationResultType) => {
          // request the password change
          this.cognito.changePassword(
            {
              AccessToken: data.AccessToken,
              PreviousPassword: oldPassword,
              ProposedPassword: newPassword
            },
            (err: Error) => {
              logger('COGNITO UPDATE PASSWORD', err);
              if (err) reject(err);
              else resolve();
            }
          );
        })
        .catch(err => reject(err));
    });
  }

  /**
   * Sign out the user from all devices.
   */
  globalSignOut(email: string, cognitoUserPoolId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.cognito.adminUserGlobalSignOut({ Username: email, UserPoolId: cognitoUserPoolId }, (err: Error) => {
        logger('COGNITO GLOBAL SIGN OUT', err);
        if (err) reject(err);
        else resolve();
      });
    });
  }

  /**
   * Confirm and conclude a registration, usign a confirmation code.
   */
  confirmSignUp(email: string, confirmationCode: string, cognitoUserPoolClientId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!email) return reject(new Error('INVALID_EMAIL'));
      if (!confirmationCode) return reject(new Error('INVALID_CONFIRMATION_CODE'));
      if (!cognitoUserPoolClientId) return reject(new Error('INVALID_CLIENT_ID'));
      // conclude the registration (sign-up) flow, using a provided confirmation code
      this.cognito.confirmSignUp(
        { Username: email, ConfirmationCode: confirmationCode, ClientId: cognitoUserPoolClientId },
        (err: Error) => {
          logger('COGNITO CONFIRM SIGN UP', err);
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  /**
   * List the groups of the user pool.
   */
  listGroups(cognitoUserPoolId: string): Promise<CognitoGroupData[]> {
    return new Promise((resolve, reject) => {
      this.cognito.listGroups({ UserPoolId: cognitoUserPoolId }, (err, data) => {
        logger('COGNITO LIST GROUPS', err);
        if (err) return reject(err);
        const groups: CognitoGroupData[] = data.Groups.map(g => ({ name: g.GroupName, description: g.Description }));
        resolve(groups);
      });
    });
  }

  /**
   * List the users part of a group in the user pool.
   */
  listUsersInGroup(group: string, cognitoUserPoolId: string): Promise<User[]> {
    return new Promise((resolve, reject) => {
      this.cognito.listUsersInGroup({ UserPoolId: cognitoUserPoolId, GroupName: group }, (err, data) => {
        logger('COGNITO LIST USERS IN GROUP', err);
        if (err) return reject(err);

        // convert the Cognito Users into the IDEA Users format
        const users = data.Users.map(u => {
          const userAttributes: any = {};
          u.Attributes.forEach((a: any) => (userAttributes[a.Name] = a.Value));
          return new User({ userId: userAttributes.sub, email: userAttributes.email, createdAt: u.UserCreateDate });
        });
        resolve(users);
      });
    });
  }

  /**
   * Add a user (by email) to a group in the user pool.
   */
  addUserToGroup(email: string, group: string, cognitoUserPoolId: string): Promise<User> {
    return new Promise((resolve, reject) => {
      this.getUserByEmail(email, cognitoUserPoolId).then(userData => {
        const user = new User({ userId: userData.sub, email: userData.email });
        this.cognito.adminAddUserToGroup(
          { UserPoolId: cognitoUserPoolId, GroupName: group, Username: user.userId },
          err => {
            logger('COGNITO ADD USER TO GROUP', err);
            if (err) reject(err);
            else resolve(user);
          }
        );
      });
    });
  }
  /**
   * Remove a user (by email) from a group in the user pool.
   */
  removeUserFromGroup(email: string, group: string, cognitoUserPoolId: string): Promise<User> {
    return new Promise((resolve, reject) => {
      this.getUserByEmail(email, cognitoUserPoolId).then(userData => {
        const user = new User({ userId: userData.sub, email: userData.email });
        this.cognito.adminRemoveUserFromGroup(
          { UserPoolId: cognitoUserPoolId, GroupName: group, Username: user.userId },
          err => {
            logger('COGNITO REMOVE USER FROM GROUP', err);
            if (err) reject(err);
            else resolve(user);
          }
        );
      });
    });
  }
}

/**
 * The attributes of a Cognito user.
 */
export interface CognitoUserData {
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
export interface CognitoGroupData {
  /**
   * The name (and id) of the group.
   */
  name: string;
  /**
   * The description of the group.
   */
  description: string;
}
