import type pl from '../pl/profile'

// Wypełnia Agent A — parytet kluczy z pl wymusza typ.
const profile: typeof pl = {
  editProfile: 'Edit Profile',
  changePassword: 'Change Password',
  username: 'Username',
  email: 'Email',
  displayName: 'Display Name',
  currentPassword: 'Current Password',
  newPassword: 'New Password',
  confirmNewPassword: 'Confirm New Password',
  allFieldsRequired: 'All fields are required',
  newPasswordsMismatch: 'New passwords do not match',
  passwordTooShort: 'New password must be at least 6 characters',
  passwordsMismatch: 'Passwords do not match',
}

export default profile
