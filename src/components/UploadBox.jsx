export default function UploadBox({ onUpload }) {
  return (
    <input
      type="file"
      onChange={(e) => onUpload(e.target.files[0])}
    />
  )
}
