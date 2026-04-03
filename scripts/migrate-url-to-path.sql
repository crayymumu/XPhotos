-- URL 域名与路径拆分 - 数据迁移脚本
-- 将 images.url / preview_url / video_url 和 albums.cover 从完整 URL 转为仅路径
-- 执行前请先备份数据！

-- 迁移前抽样检查（只读）
-- SELECT id, url, preview_url, video_url FROM images WHERE url ~ '^https?://' AND del = 0 LIMIT 10;
-- SELECT id, cover FROM albums WHERE cover ~ '^https?://' AND del = 0 LIMIT 10;

BEGIN;

UPDATE images
SET
  url = CASE
    WHEN url ~ '^https?://' THEN regexp_replace(url, '^https?://[^/]+/?', '')
    ELSE url
  END,
  preview_url = CASE
    WHEN preview_url ~ '^https?://' THEN regexp_replace(preview_url, '^https?://[^/]+/?', '')
    ELSE preview_url
  END,
  video_url = CASE
    WHEN video_url ~ '^https?://' THEN regexp_replace(video_url, '^https?://[^/]+/?', '')
    ELSE video_url
  END
WHERE del = 0;

UPDATE albums
SET
  cover = CASE
    WHEN cover ~ '^https?://' THEN regexp_replace(cover, '^https?://[^/]+/?', '')
    ELSE cover
  END
WHERE del = 0;

COMMIT;

-- 迁移后验证（只读）
-- SELECT count(*) AS remaining_full_urls FROM images WHERE (url ~ '^https?://' OR preview_url ~ '^https?://' OR video_url ~ '^https?://') AND del = 0;
-- SELECT count(*) AS remaining_full_urls FROM albums WHERE cover ~ '^https?://' AND del = 0;
