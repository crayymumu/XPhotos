import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  // 1. 迁移前抽样
  const sampleImages = await prisma.$queryRaw`
    SELECT id, url, preview_url, video_url FROM images 
    WHERE url ~ '^https?://' AND del = 0 LIMIT 5
  ` as any[]
  console.log('=== 迁移前抽样 (images) ===')
  console.log(`含完整 URL 的记录示例: ${sampleImages.length} 条`)
  sampleImages.forEach(r => console.log(`  id=${r.id}, url=${r.url?.substring(0, 60)}...`))

  const sampleAlbums = await prisma.$queryRaw`
    SELECT id, cover FROM albums 
    WHERE cover ~ '^https?://' AND del = 0 LIMIT 5
  ` as any[]
  console.log(`\n=== 迁移前抽样 (albums) ===`)
  console.log(`含完整 URL 的记录示例: ${sampleAlbums.length} 条`)
  sampleAlbums.forEach(r => console.log(`  id=${r.id}, cover=${r.cover?.substring(0, 60)}...`))

  // 2. 统计
  const [{ count: imgCount }] = await prisma.$queryRaw`
    SELECT count(*)::int AS count FROM images 
    WHERE (url ~ '^https?://' OR preview_url ~ '^https?://' OR video_url ~ '^https?://') AND del = 0
  ` as any[]
  const [{ count: albCount }] = await prisma.$queryRaw`
    SELECT count(*)::int AS count FROM albums WHERE cover ~ '^https?://' AND del = 0
  ` as any[]
  console.log(`\n需迁移: images ${imgCount} 条, albums ${albCount} 条`)

  if (imgCount === 0 && albCount === 0) {
    console.log('无需迁移，退出')
    return
  }

  // 3. 执行迁移（事务）
  console.log('\n开始迁移...')
  await prisma.$transaction([
    prisma.$executeRaw`
      UPDATE images SET
        url = CASE WHEN url ~ '^https?://' THEN regexp_replace(url, '^https?://[^/]+/?', '') ELSE url END,
        preview_url = CASE WHEN preview_url ~ '^https?://' THEN regexp_replace(preview_url, '^https?://[^/]+/?', '') ELSE preview_url END,
        video_url = CASE WHEN video_url ~ '^https?://' THEN regexp_replace(video_url, '^https?://[^/]+/?', '') ELSE video_url END
      WHERE del = 0
    `,
    prisma.$executeRaw`
      UPDATE albums SET
        cover = CASE WHEN cover ~ '^https?://' THEN regexp_replace(cover, '^https?://[^/]+/?', '') ELSE cover END
      WHERE del = 0
    `,
  ])
  console.log('迁移完成')

  // 4. 迁移后验证
  const [{ count: remainImg }] = await prisma.$queryRaw`
    SELECT count(*)::int AS count FROM images 
    WHERE (url ~ '^https?://' OR preview_url ~ '^https?://' OR video_url ~ '^https?://') AND del = 0
  ` as any[]
  const [{ count: remainAlb }] = await prisma.$queryRaw`
    SELECT count(*)::int AS count FROM albums WHERE cover ~ '^https?://' AND del = 0
  ` as any[]
  console.log(`\n=== 迁移后验证 ===`)
  console.log(`images 残留完整 URL: ${remainImg} 条`)
  console.log(`albums 残留完整 URL: ${remainAlb} 条`)

  if (remainImg === 0 && remainAlb === 0) {
    console.log('✓ 迁移成功，所有字段均已转为路径格式')
  } else {
    console.log('⚠ 仍有残留完整 URL，请检查')
  }
}

main()
  .catch(e => { console.error('迁移失败:', e); process.exit(1) })
  .finally(() => prisma.$disconnect())
