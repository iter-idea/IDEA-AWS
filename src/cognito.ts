import { CognitoIdentityServiceProvider } from 'aws-sdk';
import { isEmpty, logger } from 'idea-toolbox';

/**
 * A wrapper for AWS Cognito.
 */
export class Cognito {
  /**
   * Get the attributes of the user, from the authorizer claims.
   * @param claims authorizer claims
   * @return user's data
   */
  public getUserByClaims(claims: any): CognitoUserData {
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
  public getUserByEmail(email: string, cognitoUserPoolId: string): Promise<CognitoUserData> {
    return new Promise((resolve, reject) => {
      // find the user by the email
      new CognitoIdentityServiceProvider({ apiVersion: '2016-04-18' }).adminGetUser(
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
  public getUserBySub(sub: string, cognitoUserPoolId: string): Promise<CognitoUserData> {
    return new Promise((resolve, reject) => {
      // find the user by the sub
      new CognitoIdentityServiceProvider({ apiVersion: '2016-04-18' }).listUsers(
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
  public createUser(email: string, cognitoUserPoolId: string, options?: CreateUserOptions): Promise<string> {
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
      new CognitoIdentityServiceProvider().adminCreateUser(
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
  public resendPassword(email: string, cognitoUserPoolId: string, options?: CreateUserOptions): Promise<void> {
    return new Promise((resolve, reject) => {
      options = options || {};
      if (isEmpty(email, 'email')) return reject(new Error('INVALID_EMAIL'));
      const params: CognitoIdentityServiceProvider.AdminCreateUserRequest = {
        UserPoolId: cognitoUserPoolId,
        Username: email,
        MessageAction: 'RESEND'
      };
      if (options.temporaryPassword) params.TemporaryPassword = options.temporaryPassword;
      new CognitoIdentityServiceProvider().adminCreateUser(
        params,
        (err: Error, data: CognitoIdentityServiceProvider.AdminCreateUserResponse) => {
          logger('COGNITO RESEND PASSWORD', err);
          if (err)
            switch (err.name) {
              case 'UnsupportedUserStateException':
                return reject(new Error('USER_ALREADY_CONFIRMED_PASSWORD'));
              default:
                return reject(err);
            }
          else resolve();
        }
      );
    });
  }

  /**
   * Delete a user by its email (username), in the pool specified.
   */
  public deleteUser(email: string, cognitoUserPoolId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (isEmpty(email, 'email')) return reject(new Error('INVALID_EMAIL'));
      new CognitoIdentityServiceProvider().adminDeleteUser(
        { UserPoolId: cognitoUserPoolId, Username: email },
        (err: Error) => {
          logger('COGNITO DELETE USER', err);
          if (err) reject(new Error('DELETION_FAILED'));
          else resolve();
        }
      );
    });
  }

  /**
   * Sign in a user of a specific pool through username and password.
   */
  public signIn(
    email: string,
    password: string,
    cognitoUserPoolId: string,
    cognitoUserPoolClientId: string
  ): Promise<CognitoIdentityServiceProvider.AuthenticationResultType> {
    return new Promise((resolve, reject) => {
      new CognitoIdentityServiceProvider({ apiVersion: '2016-04-18' }).adminInitiateAuth(
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
   * Change the email address (== username) associated to a user.
   */
  public updateEmail(email: string, newEmail: string, cognitoUserPoolId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (isEmpty(newEmail, 'email')) return reject(new Error('INVALID_NEW_EMAIL'));
      new CognitoIdentityServiceProvider({ apiVersion: '2016-04-18' }).adminUpdateUserAttributes(
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
  public updatePassword(
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
          new CognitoIdentityServiceProvider({ apiVersion: '2016-04-18' }).changePassword(
            {
              AccessToken: data.AccessToken,
              PreviousPassword: oldPassword,
              ProposedPassword: newPassword
            },
            (err: Error, _: any) => {
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
  public globalSignOut(email: string, cognitoUserPoolId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      new CognitoIdentityServiceProvider({ apiVersion: '2016-04-18' }).adminUserGlobalSignOut(
        { Username: email, UserPoolId: cognitoUserPoolId },
        (err: Error) => {
          logger('COGNITO GLOBAL SIGN OUT', err);
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  /**
   * Confirm and conclude a registration, usign a confirmation code.
   */
  public confirmSignUp(email: string, confirmationCode: string, cognitoUserPoolClientId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!email) return reject(new Error('INVALID_EMAIL'));
      if (!confirmationCode) return reject(new Error('INVALID_CONFIRMATION_CODE'));
      if (!cognitoUserPoolClientId) return reject(new Error('INVALID_CLIENT_ID'));
      // conclude the registration (sign-up) flow, using a provided confirmation code
      new CognitoIdentityServiceProvider({ apiVersion: '2016-04-18' }).confirmSignUp(
        { Username: email, ConfirmationCode: confirmationCode, ClientId: cognitoUserPoolClientId },
        (err: Error) => {
          logger('COGNITO CONFIRM SIGN UP', err);
          if (err) reject(err);
          else resolve();
        }
      );
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
