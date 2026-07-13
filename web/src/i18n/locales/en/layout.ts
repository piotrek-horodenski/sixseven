import type pl from '../pl/layout'

// Wypełnia Agent A — parytet kluczy z pl wymusza typ.
const layout: typeof pl = {
  appLogoAlt: 'app logo',
  collapse: 'collapse',
  menu: {
    home: 'Home',
    images: 'Images',
    admin: 'Admin',
  },
  profileMenu: {
    // etykieta linku w menu pionowym (małą literą, jak oryginał)
    label: 'profile',
    guest: 'Guest',
    profile: 'Profile',
    history: 'History & badges',
    preferences: 'Preferences',
    dev: 'For developers',
    logout: 'Logout',
  },
}

export default layout
