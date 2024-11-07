import { getData, setData } from './dataStore';
import { isSessionValid, generateHash, isNameValid } from './helperFunctions';
import validator from 'validator';

/**
 * Adds a struct to the users array stored in dataStore in dataStore.js
 *
 * @param {string} email
 * @param {string} password
 * @param {string} nameFirst
 * @param {string} nameLast
 * @returns {authUserId: number}
 */
function adminAuthRegister(email: string, password: string, nameFirst: string, nameLast: string) {
  const data = getData();

  // checks if email has been used
  for (const user of data.users) {
    if (user.email === email) {
      return { error: 'Email has already been used' };
    }
  }
  // email does not meet specifications error
  if (!validator.isEmail(email)) {
    return { error: 'Email is invalid' };
  }

  const nameValid = isNameValid(nameFirst, nameLast);
  if (nameValid !== true) {
    return nameValid;
  }
  // Password is less than 8 characters.
  if (password.length < 8) {
    return { error: 'Password is too short' };
  }
  // Password does not contain at least one number and at least one letter.
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return { error: "Password doesn't contain letters and/or numbers" };
  }
  // Hashing the password
  const storedPassword = generateHash(password);

  const sessionId = createToken();
  const userId = createId();

  // pushes paramter values to users array in the form of a struct
  data.users.push({
    userId: userId,
    tokens: [sessionId],
    email: email,
    nameFirst: nameFirst,
    nameLast: nameLast,
    password: storedPassword,
    oldPasswords: [],
    numSuccessfulLogins: 1,
    numFailedPasswords: 0,
  });

  setData(data);
  // returns the user Id
  return {
    sessionId: sessionId
  };
}

/**
 * creates a string of numbers of length 6
 * @returns {string}
 */
function createToken(): string {
  const data = getData();
  let randomIntegerString: string;
  let count = -21381390;

  // Ensure token is not a duplicate
  while (count !== data.users.length) {
    randomIntegerString = Math.random().toString().substring(2, 8);
    count = 0;

    for (const user of data.users) {
      for (const token of user.tokens) {
        if (token !== randomIntegerString) {
          count++;
        }
      }
    }
  }

  return randomIntegerString;
}

/**
 * Generates a random user ID that is not a duplicate.
 * @returns {number}
 */
function createId(): number {
  const data = getData();
  let randomInteger: number;
  let randomString: string;
  let count = -328948903;
  // Ensure token is not a duplicate
  while (count !== data.users.length) {
    randomString = Math.random().toString().substring(2, 8);
    randomInteger = parseInt(randomString, 10);
    count = 0;

    for (const user of data.users) {
      if (user.userId !== randomInteger) {
        count++;
      }
    }
  }

  return randomInteger;
}

/**
* logs in the user
*
* @param {string} email
* @param {string} password
* @returns {authUserId: number}
*/

function adminAuthLogin(email: string, password: string) {
  const data = getData();
  // sets value checks to 0 (not found)
  let emailFound = 0;
  let correctPassword = 0;
  let userId = 0;

  // finds user and checks password is correct
  for (const user of data.users) {
    if (user.email === email) {
      emailFound++;
      if (user.password === generateHash(password)) {
        correctPassword++;
        userId = user.userId;
        // resets numFailedPasswords to 0 and adds one to numSuccessfulLogins
        user.numSuccessfulLogins++;
        user.numFailedPasswords = 0;
      } else {
        // adds one to the number of failed passwords in a row
        user.numFailedPasswords++;
      }
    }
  }
  // sets password failed and correct passwords to the struct in the array
  setData(data);

  // if email not found
  if (emailFound === 0) {
    return { error: 'Email does not exist' };
  }
  // if incorrect password
  if (correctPassword === 0) {
    return { error: 'Incorrect password for given email' };
  }

  // sets sessionId in the said user object to be this newly created one
  const sessionId = createToken();

  for (const id of data.users) {
    if (id.userId === userId) {
      id.tokens.push(sessionId);
    }
  }

  setData(data);

  return {
    token: sessionId
  };
}

/**
* Updates password of user
*
* @param {number} authUserId
* @param {string} oldPassword
* @param {string} newPassword
* @returns {}
*/

function adminUserPasswordUpdate(token: string, oldPassword: string, newPassword: string) {
  const data = getData();

  // finds the userId of the associated token
  const user = data.users.find(users => isSessionValid(token, users.tokens));

  // finds array position of user in data.users
  if (!user) {
    return { error: 'invalid token is not a valid user' };
  }
  // Old Password is not the correct old password
  if (user.password !== generateHash(oldPassword)) {
    return { error: 'incorrect old password' };
    // Old Password and New Password match exactly
  } else if (oldPassword === newPassword) {
    return { error: 'old password identical to new password' };
  } else {
    // New Password has already been used before by this user
    for (const oldpasscode of user.oldPasswords) {
      if (oldpasscode === generateHash(newPassword)) {
        return { error: 'password has been used before' };
      }
    }
    // New Password is less than 8 characters
    if (newPassword.length < 8) {
      return { error: 'password length too short' };
      // New Password does not contain at least one number and at least one letter
    } else if (!/\d/.test(newPassword)) {
      return { error: "Password doesn't contain any numbers" };
    } else if (!/[A-Za-z]/.test(newPassword)) {
      return { error: "Password doesn't contain any characters" };
    }
  }
  // updates user struct with old password and new password
  user.oldPasswords.push(generateHash(oldPassword));
  user.password = generateHash(newPassword);
  setData(data);
  return {

  };
}

/**
* Returns the details for that user Id
*
* @param {number} authUserId
* @returns { user: {
*    userId: number,
*    name: string.
*    email: string,
*    numSuccessfulLogins: number,
*    numFailedPasswordsSinceLastLogin: number,
* }}
*/

function adminUserDetails(token: string) {
  // Obtains data stored
  const data = getData();
  // to hold the user id.
  // finds the userId of the associated token
  const user = data.users.find(users => isSessionValid(token, users.tokens));

  // if no id found
  if (!user) {
    return { error: 'Invalid token' };
  }

  return {
    user:
    {
      userId: user.userId,
      name: user.nameFirst + ' ' + user.nameLast,
      email: user.email,
      numSuccessfulLogins: user.numSuccessfulLogins,
      numFailedPasswordsSinceLastLogin: user.numFailedPasswords,
    }
  };
}

/**
* Updates the details of the user struct containing the user id
*
* @param {string} token
* @param {string} email
* @param {string} nameFirst
* @param {string} nameLast
* @returns {}
*/

function adminUserDetailsUpdate(token: string, email: string, nameFirst: string, nameLast: string) {
  // Retrieve the data from the datastore
  const data = getData();
  // to hold the user id.
  // finds the userId of the associated token
  const user = data.users.find(users => isSessionValid(token, users.tokens));

  // If the token is invalid, return an error
  if (!user) {
    return { error: 'Invalid token' };
  }

  // Check if the provided email is already in use by another user
  for (const users of data.users) {
    if (users.email === email && users.userId !== user.userId) {
      return {
        error: 'Email is currently used by another user'
      };
    }
  }

  // Validate the format of the email address
  if (!validator.isEmail(email)) {
    return {
      error: 'Email is invalid'
    };
  }

  const nameValid = isNameValid(nameFirst, nameLast);
  if (nameValid !== true) {
    return nameValid;
  }

  // Update the authenticated user's email and names with the provided values
  user.email = email;
  user.nameFirst = nameFirst;
  user.nameLast = nameLast;

  // Save the updated data back to the datastore
  setData(data);

  // Return an empty object to indicate success
  return {};
}

/**
 * Logs out the user with the given session token.
 * @param {string} token - Session token of the user to be logged out.
 * @returns {}
 */
function adminAuthLogout(token: string) {
  // checks for valid user id
  const data = getData();

  const user = data.users.find(users => users.tokens.includes(token));
  // finds array position of user in data.users

  if (!user) {
    return { error: 'invalid token is not a valid user' };
  }
  const sessionIndex = user.tokens.findIndex((sessionId) => sessionId === token);
  if (sessionIndex === -1) {
    return { error: 'invalid token is not a valid user' };
  }
  user.tokens.splice(sessionIndex, 1);
  setData(data);
  return {};
}

// export all files needed for use in another file
export { adminAuthRegister, adminAuthLogin, adminUserDetails, adminUserDetailsUpdate, adminUserPasswordUpdate, adminAuthLogout };
