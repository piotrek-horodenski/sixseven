import type pl from '../pl/auth'

// Wypełnia Agent A — parytet kluczy z pl wymusza typ.
const auth: typeof pl = {
  logIn: 'Log in',
  register: 'Register',
  createAccount: 'Create account',
  username: 'Username',
  email: 'Email',
  emailOrUsername: 'Email or Username',
  password: 'Password',
  connectingToServer: 'Connecting to server...',
  noAccount: "Don't have an account?",
  alreadyHaveAccount: 'Already have an account?',
  // Zdanie rozbite: tekst + link ("You can now [log in].")
  accountCreated: 'Account created! You can now',
  accountCreatedLogIn: 'log in',
}

export default auth
