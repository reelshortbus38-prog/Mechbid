export async function parseExcel(file) {
  const formData = new FormData()
  formData.append('file', file)

  const res = await fetch('/api/parse-excel', {
    method: 'POST',
    body: formData,
  })

  return res.json()
}
