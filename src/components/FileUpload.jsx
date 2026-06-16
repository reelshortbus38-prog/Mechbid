import * as XLSX from 'xlsx'

export default function FileUpload({ onParsed }) {
  const handleFile = (e) => {
    const file = e.target.files[0]

    const reader = new FileReader()
    reader.onload = (evt) => {
      const data = new Uint8Array(evt.target.result)
      const workbook = XLSX.read(data, { type: 'array' })

      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      const json = XLSX.utils.sheet_to_json(sheet)

      onParsed(json)
    }

    reader.readAsArrayBuffer(file)
  }

  return <input type="file" onChange={handleFile} />
}
