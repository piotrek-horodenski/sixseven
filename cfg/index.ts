import path from 'path'

import { getMergedSettings } from './helpers/get-merged-settings.ts'
import { startTheProcess } from "./helpers/start-process.ts"
import { walk } from "./helpers/walk.ts"

const mergedSettings = getMergedSettings()
const parts = [
  'db',
  'gate',
  'web',
]
const filesToOmitBase = [
  'node_modules',
]
const filesToOmit: any[] = []
const files: any[] = []
const ready: any[] = []

parts.forEach((part, index) => {
  filesToOmitBase.forEach(item => {
    filesToOmit.push(path.resolve('../' + part + '/' + item))
  })

  walk('../' + part, function(err, results) {
    ready.push(index)

    if (err || !results || !results.length) {
      return
    }
    results.forEach((result) => {
      files.push(result)
    })

    if (ready.length === parts.length) {
      startTheProcess(files, mergedSettings)
    }
  }, filesToOmit)
})
