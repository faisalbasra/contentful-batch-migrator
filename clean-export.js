const fs = require('fs');

console.log('Cleaning file...\n');

const data = JSON.parse(fs.readFileSync('./contentful-export/exported-space-uploadfrom-v2.json', 'utf8'));
console.log('Original assets:', data.assets.length);

// Remove assets without valid URLs
const badAssetIds = new Set();
data.assets = data.assets.filter(asset => {
  if (asset.fields && asset.fields.file) {
    for (let locale in asset.fields.file) {
      const file = asset.fields.file[locale];
      if (!file || !file.url || file.url === '') {
        console.log('Removing asset:', asset.sys.id, '(missing/empty URL)');
        badAssetIds.add(asset.sys.id);
        return false;
      }
    }
  }
  return true;
});

console.log('Cleaned assets:', data.assets.length);
console.log('Removed:', badAssetIds.size, 'assets\n');

// Remove references from entries
let refsRemoved = 0;
data.entries.forEach(entry => {
  if (entry.fields) {
    Object.keys(entry.fields).forEach(fieldName => {
      Object.keys(entry.fields[fieldName]).forEach(locale => {
        const value = entry.fields[fieldName][locale];

        if (value && value.sys && value.sys.type === 'Link' && value.sys.linkType === 'Asset') {
          if (badAssetIds.has(value.sys.id)) {
            delete entry.fields[fieldName][locale];
            refsRemoved++;
          }
        }

        if (Array.isArray(value)) {
          const filtered = value.filter(item => {
            if (item && item.sys && item.sys.type === 'Link' && item.sys.linkType === 'Asset') {
              if (badAssetIds.has(item.sys.id)) {
                refsRemoved++;
                return false;
              }
            }
            return true;
          });
          entry.fields[fieldName][locale] = filtered;
        }
      });
    });
  }
});

console.log('Removed', refsRemoved, 'references from entries');

// Save final file
fs.writeFileSync('./contentful-export/exported-space-final.json', JSON.stringify(data, null, 2));
console.log('\n✅ Final clean file saved: exported-space-final.json');
console.log('   Assets:', data.assets.length);
console.log('   Entries:', data.entries.length);
