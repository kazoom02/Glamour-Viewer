const url = new URL('search', 'https://v2.xivapi.com/api/')
url.searchParams.set('sheets', 'Item')
url.searchParams.set('query', '+EquipSlotCategory.Body>0')
url.searchParams.set('limit', '2000')
fetch(url).then(r => r.json()).then(d => {
  console.log("Returned items: ", d.results?.length)
}).catch(e => console.error(e))
