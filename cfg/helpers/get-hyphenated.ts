
export function getHyphenatedKeys(settings) {
  const settingsKeys = Object.keys(settings)
  const hyphenatedKeys = settingsKeys.reduce((obj: any, key) => {
    const hyphenatedKey = key.replace(/([A-Z])/g, '-$1').toLowerCase()
    obj[key] = '---' + hyphenatedKey + '---'
    return obj
  }, {})

  return hyphenatedKeys
}
