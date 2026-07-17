const fs = require('fs')
const buf = fs.readFileSync('public/animation-catalog.json')
const catalog = JSON.parse(buf)
for (const cat of catalog.categories) {
  for (const entry of cat.entries) {
    if (entry.label.includes('instrument03')) {
      console.log(entry)
    }
  }
}
