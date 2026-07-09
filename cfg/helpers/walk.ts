import fs from 'fs'
import path from 'path'

export const walk = function(dir, done, filesToOmit) {
  let results: any[] = []
  fs.readdir(dir, function(err, list) {
    if (err) return done(err)
    let i = 0;

    (function next() {
      let file = list[i++]
      if (!file) return done(null, results)
      file = path.resolve(dir, file)
      fs.stat(file, function(err, stat) {
        if (-1 < filesToOmit.indexOf(path.resolve(file))) {
          next()
        } else if (stat && stat.isDirectory()) {
          walk(file, function(err, res) {
            results = results.concat(res)
            next()
          }, filesToOmit)
        } else {
          if (path.basename(file) === '.env.template') {
            results.push({
              filename: file,
              basename: path.basename(file),
              dirname: path.dirname(file),
              content: fs.readFileSync(file, 'utf8'),
            })
          }
          next()
        }
      })
    })()
  })
}
