-- Additive read-only projection for the native C++ service.
-- Existing tables, credentials and business rows are not changed.
BEGIN;
CREATE OR REPLACE VIEW native_public_works_v1 WITH (security_barrier=true) AS
SELECT w.id AS work_id, u.handle, w.slug, w.resource_type, w.asset_category,
 concat_ws(' ',w.title,w.title_zh,w.title_en,w.title_ja,w.summary,w.summary_zh,w.summary_en,w.summary_ja) AS search_text,
 w.published_at,w.created_at,
 GREATEST(CASE WHEN w.exhibition_recommended THEN COALESCE(w.curation_score,0) ELSE 0 END,COALESCE(r.average,0)*20) AS exhibition_rank,
 ((w.exhibition_recommended=true AND w.curation_score>=90) OR (r.average>=4.5 AND r.count>=10 AND r.recommendations>=10)) IS TRUE AS eligible,
 jsonb_build_object(
 'id',w.id,'slug',w.slug,'url','/w/'||u.handle||'/'||w.slug,'status',w.status,'resourceType',w.resource_type,
 'assetCategory',COALESCE(w.asset_category,''),'title',w.title,'titleZh',w.title_zh,'titleEn',w.title_en,'titleJa',w.title_ja,
 'summary',COALESCE(w.summary,''),'summaryZh',w.summary_zh,'summaryEn',w.summary_en,'summaryJa',w.summary_ja,
 'image',CASE WHEN EXISTS(SELECT 1 FROM work_assets a WHERE a.kind='source' AND a.file_url=w.image) THEN '' ELSE COALESCE(w.image,'') END,
 'thumbnail',CASE WHEN EXISTS(SELECT 1 FROM work_assets a WHERE a.kind='source' AND a.file_url=w.thumbnail) THEN '' ELSE COALESCE(w.thumbnail,'') END,
 'modelUrl',CASE WHEN EXISTS(SELECT 1 FROM work_assets a WHERE a.kind='source' AND a.file_url=w.model_url) THEN '' ELSE COALESCE(w.model_url,'') END,
 'priceCents',w.price_cents,'currency',w.currency,'license',w.license,'contentVersion',w.rating_version,
 'format',COALESCE(w.format,''),'modelSize',COALESCE(w.model_size,''),'workflow',COALESCE(w.workflow,''),
 'stack',w.stack,'tags',w.tags,'viewerFeatures',w.viewer_features,
 'createdAt',w.created_at,'publishedAt',w.published_at,'updatedAt',w.updated_at,
 'creator',jsonb_build_object('id',u.id,'handle',u.handle,'displayName',u.display_name,'avatarUrl',COALESCE(u.avatar_url,''),
 'profilePublic',u.profile_public IS TRUE AND u.profile_admin_disabled IS NOT TRUE),
 'curation',jsonb_build_object('score',w.curation_score,'recommended',w.exhibition_recommended),
 'ratings',jsonb_build_object('count',COALESCE(r.count,0),'average',COALESCE(r.average,0),'recommendations',COALESCE(r.recommendations,0))
 ) AS payload
FROM works w JOIN visitor_users u ON u.id=w.creator_id
LEFT JOIN LATERAL(
 SELECT count(*)::int AS count,COALESCE(avg(rating.score),0)::float AS average,count(*) FILTER(WHERE rating.recommended)::int AS recommendations
 FROM work_ratings rating JOIN visitor_users voter ON voter.id=rating.user_id
 WHERE rating.work_id=w.id AND rating.work_version=w.rating_version AND voter.email_verified_at IS NOT NULL AND rating.user_id<>w.creator_id
) r ON true
WHERE w.status='published';
CREATE OR REPLACE VIEW native_public_assets_v1 WITH (security_barrier=true) AS
SELECT a.work_id,a.kind,a.sort_order,a.created_at,
 jsonb_build_object('id',a.id,'kind',a.kind,'fileName',a.file_name,'bytes',a.file_size,
 'protected',a.kind='source' OR EXISTS(SELECT 1 FROM work_assets source WHERE source.kind='source' AND source.file_url=a.file_url),'fileUrl',CASE WHEN a.kind='source' OR EXISTS(SELECT 1 FROM work_assets source WHERE source.kind='source' AND source.file_url=a.file_url) THEN NULL ELSE a.file_url END) AS payload
FROM work_assets a JOIN works w ON w.id=a.work_id WHERE w.status='published';
REVOKE ALL ON native_public_works_v1,native_public_assets_v1 FROM PUBLIC;
COMMIT;
