create table if not exists clinics (
  id text primary key,
  place_id text not null unique,
  name text not null,
  review_status text not null default 'needs_review',
  confidence text not null default 'low',
  source text not null default 'google_places',
  lat real not null,
  lng real not null,
  fetched_at text not null,
  expires_at text not null,
  notes text,
  payload text not null,
  updated_at text not null default current_timestamp
);

create table if not exists scored_areas (
  area_code text primary key,
  area_name text not null,
  local_authority text not null,
  overall_score integer not null,
  payload text not null,
  updated_at text not null default current_timestamp
);
