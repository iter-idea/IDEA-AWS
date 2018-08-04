import AWS = require('aws-sdk');
import IdeaX = require('idea-toolbox');
import Validator = require('validator');

/**
 * A wrapper for AWS Cognito.
 */
export class Cognito {
  /**
   * Initialize a new Cognito helper object.
   */
  constructor() {}

  /**
   * Get the attributes of the user, from the authorizer claims.
   * @param {any} claims authorizer claims
   * @return {any | null} user's data
   */
  public getUserByClaims(claims: any): any | null {
    if(!claims) return null;
    let user: any = {};
    // add any additional cognito attribute available in cognito
    for(let p in claims) if(p.startsWith('cognito:')) user[p.slice(8)] = claims[p];
    // map the important attributes with reserved names
    user.userId = claims.sub;
    user.email = claims.email;
    user.name = claims.name;
    user.phoneNumber = claims.phone_number;
    return user;
  }

  /**
   * Identify a user by its email address, returning its attributes.
   * @param {string} email user's email
   * @param {string} cognitoUserPoolId the pool in which to search
   * @return {Promise<any>}
   */
  public getUserByEmail(email: string, cognitoUserPoolId: string): Promise<any> {
    return new Promise((resolve, reject) => {
      // find the user by the email
      new AWS.CognitoIdentityServiceProvider({ apiVersion: '2016-04-18' })
      .listUsers({ UserPoolId: cognitoUserPoolId, Filter: `email = "${email}"`, Limit: 1},
      (err: Error, data: any) => {
        if(err || !data || !data.Users || !data.Users[0]) reject();
        else {
          // convert and return the attributes
          let userAttributes: any = {};
          data.Users[0].Attributes.forEach((a: any) => userAttributes[a.Name] = a.Value);
          resolve(userAttributes);
        }
      });
    });
  }

  /**
   * Identify a user by its sub, returning its attributes.
   * @param {string} sub user's sub (userId)
   * @param {string} cognitoUserPoolId the pool in which to search
   * @return {Promise<any>}
   */
  public getUserBySub(sub: string, cognitoUserPoolId: string): Promise<any> {
    return new Promise((resolve, reject) => {
      // find the user by the sub
      new AWS.CognitoIdentityServiceProvider({ apiVersion: '2016-04-18' })
      .listUsers({ UserPoolId: cognitoUserPoolId, Filter: `sub = "${sub}"`, Limit: 1},
      (err: Error, data: any) => {
        if(err || !data || !data.Users || !data.Users[0]) reject();
        else {
          // convert and return the attributes
          let userAttributes: any = {};
          data.Users[0].Attributes.forEach((a: any) => userAttributes[a.Name] = a.Value);
          resolve(userAttributes);
        }
      });
    });
  }

  /**
   * Create a new user (by its email) in the pool specified.
   * @param {string} email the email to login of the new user
   * @param {string} cognitoUserPoolId the pool in which to create the user
   * @return {Promise<string>} userId of the new user
   */
  public createUser(email: string, cognitoUserPoolId: string): Promise<string> {
    return new Promise((resolve, reject) => {
      if(!Validator.isEmail(email)) return reject(new Error(`E.COGNITO.INVALID_EMAIL`));
      let attributes = [{ Name: 'email', Value: email }, { Name: 'email_verified', Value: 'true' }];
      new AWS.CognitoIdentityServiceProvider().adminCreateUser({
        UserPoolId: cognitoUserPoolId, Username: email, UserAttributes: attributes
      }, (err: Error, data: any) => {
        IdeaX.logger('COGNITO CREATE USER', err, data);
        if(err) return reject(err);
        let userId = data.User.Attributes.find((attr: any) => attr.Name == 'sub').Value || null;
        if(userId) resolve(userId);
        else reject(new Error(`E.COGNITO.INVALID_USER_ID`));
      });
    });
  }
}