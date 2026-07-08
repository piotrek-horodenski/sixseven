import fs from 'fs'
import path from 'path'

import { getHyphenatedKeys } from "./get-hyphenated"

export function startTheProcess(files, mergedSettings) {
  const hyphenatedKeys = getHyphenatedKeys(mergedSettings)

  files.forEach((file) => {
    let output = file.content

    for (const [key, placeholder] of Object.entries(hyphenatedKeys)) {
      output = output.replaceAll(placeholder as string, String(mergedSettings[key] ?? ''))
    }

    fs.writeFileSync(path.join(file.dirname, '.env'), output)
  })
}
