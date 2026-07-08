import fs from 'fs'

import { getHyphenatedKeys } from "./get-hyphenated.ts"

export const getMergedSettings = () => {

  const settingsData = fs.readFileSync('settings.json', 'utf8')
  const settings = JSON.parse(settingsData)
  const settingsBaseData = fs.readFileSync('settings.base.json', 'utf8')
  const settingsBase = JSON.parse(settingsBaseData)
  const settingsExtended = JSON.parse(settingsBaseData)
  let mergedSettings = { ...settingsExtended }
  const hyphenatedKeys = getHyphenatedKeys(settingsBase)

  for (const mergedSettingsKey in mergedSettings) {
    for (const camelCasedKey in hyphenatedKeys) {
      if (mergedSettings[camelCasedKey] === undefined) {
        continue
      }
      if (typeof mergedSettings[mergedSettingsKey] === 'string') {
        const searchItem = hyphenatedKeys[camelCasedKey]
        const replaceWith = settingsBase[camelCasedKey]

        mergedSettings[mergedSettingsKey] = mergedSettings[mergedSettingsKey].replace(searchItem, replaceWith)
      }
    }
  }

  Object.keys(settings).forEach(key => {
    mergedSettings[key] = settings[key]
  })

  return mergedSettings;
}