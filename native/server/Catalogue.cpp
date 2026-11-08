#include "Catalogue.hpp"
#include <libpq-fe.h>
#include <memory>
#include <nlohmann/json.hpp>
#include <stdexcept>
#include <vector>
namespace mr {
using Connection = std::unique_ptr<PGconn, decltype(&PQfinish)>;
using Result = std::unique_ptr<PGresult, decltype(&PQclear)>;
std::string Catalogue::execute(const std::string &sql,
                               const std::vector<std::string> &values) const {
  const char *keys[] = {"dbname", "connect_timeout", "options", "application_name", nullptr};
  const char *vals[] = {database_.c_str(), "3",
                        "-c default_transaction_read_only=on -c statement_timeout=5000",
                        "mrright-native", nullptr};
  Connection db(PQconnectdbParams(keys, vals, 1), PQfinish);
  if (!db || PQstatus(db.get()) != CONNECTION_OK)
    throw std::runtime_error("Database unavailable");
  std::vector<const char *> args;
  for (const auto &v : values)
    args.push_back(v.c_str());
  Result result(PQexecParams(db.get(), sql.c_str(), int(args.size()), nullptr, args.data(), nullptr,
                             nullptr, 0),
                PQclear);
  if (!result || PQresultStatus(result.get()) != PGRES_TUPLES_OK)
    throw std::runtime_error("Catalogue query failed");
  if (PQntuples(result.get()) == 0)
    return {};
  return PQgetvalue(result.get(), 0, 0);
}
bool Catalogue::ready() const {
  try {
    return execute("SELECT 'ready' FROM native_public_works_v1 LIMIT 0", {}).empty();
  } catch (...) {
    return false;
  }
}
std::string Catalogue::list(const Filters &f) const {
  validate(f);
  std::string sql = R"SQL(
 WITH filtered AS MATERIALIZED (
 SELECT * FROM native_public_works_v1
 WHERE ($1='' OR resource_type=$1) AND ($2='' OR asset_category=$2)
 AND ($3='' OR search_text ILIKE '%'||$3||'%') AND ($4='' OR lower(handle)=lower($4)) AND (NOT $5::boolean OR eligible)
 ), selected AS (
 SELECT payload FROM filtered ORDER BY CASE WHEN $5::boolean THEN exhibition_rank ELSE NULL END DESC,
 published_at DESC NULLS LAST,created_at DESC,work_id LIMIT $6::int OFFSET $7::int
 ), total AS(SELECT count(*)::int AS n FROM filtered), facets AS(
 SELECT COALESCE(jsonb_object_agg(resource_type,n),'{}'::jsonb) AS value FROM(SELECT resource_type,count(*)::int AS n FROM native_public_works_v1 GROUP BY resource_type) c)
 SELECT jsonb_build_object('data',jsonb_build_object('works',COALESCE((SELECT jsonb_agg(payload) FROM selected),'[]'::jsonb),
 'resourceCounts',(SELECT value FROM facets)),'error',NULL,
 'pagination',jsonb_build_object('page',$8::int,'limit',$6::int,'total',n,
 'pages',GREATEST(1,ceil(n::numeric/$6::int)::int),'hasPrevious',$8::int>1,'hasNext',$7::int+$6::int<n)) FROM total
 )SQL";
  return execute(sql, {f.type, f.category, f.query, f.creator, f.exhibition ? "true" : "false",
                       std::to_string(f.limit), std::to_string((f.page - 1) * f.limit),
                       std::to_string(f.page)});
}
std::string Catalogue::detail(const std::string &handle, const std::string &slug) const {
  auto data = execute(R"SQL(
 SELECT jsonb_build_object('data',jsonb_build_object('work',w.payload||jsonb_build_object('assets',
 COALESCE((SELECT jsonb_agg(a.payload ORDER BY a.kind,a.sort_order,a.created_at) FROM native_public_assets_v1 a WHERE a.work_id=w.work_id),'[]'::jsonb))),
 'pagination','{}'::jsonb,'error',NULL)
 FROM native_public_works_v1 w WHERE lower(w.handle)=lower($1) AND w.slug=$2
 )SQL",
                      {handle, slug});
  return data;
}
} // namespace mr
