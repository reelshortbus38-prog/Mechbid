export function processQuote(data) {
  let totalMaterial = 0
  let totalLabor = 0

  const items = data.map((row) => {
    const material = Number(row.material || row.Material || 0)
    const labor = Number(row.labor || row.Labor || 0)

    totalMaterial += material
    totalLabor += labor

    return {
      name: row.name || row.Description || 'Item',
      material,
      labor,
      total: material + labor,
    }
  })

  const grandTotal = totalMaterial + totalLabor

  return {
    items,
    totalMaterial,
    totalLabor,
    grandTotal,
  }
}
