# Clinical Case Publishing Bridge Design

## Capability

Build a bridge from the internal clinic app to the public AM Estetica Dental website so authorized clinic users can turn selected patient assets into public clinical cases.

Users with publishing access:
- owner
- admin
- reception
- marketing

Core outcome:
- From a patient record, a user selects photos and eventually 3D assets.
- Selected photos can be edited/cropped through the existing Photo Studio workflow.
- Only selected assets are prepared for publication.
- Prepared image assets are uploaded to Cloudinary.
- Public case data is saved in Supabase.
- The public website reads app-published cases and shows them in the same `/casos` grid as existing manually coded cases.

## Current Context

Internal app:
- Patient file browsing lives in `components/patients/drive/PatientDriveTab.tsx`.
- Individual asset cards live in `components/patients/drive/DriveFileCard.tsx`.
- Photo editing lives in `components/patients/drive/PhotoStudioModal.tsx`.
- Drive file listing and mutation actions live in `app/actions/patient-files-drive.ts`.
- Drive files are represented by `DriveFile` with `id`, `name`, `mimeType`, `webViewLink`, `createdTime`, optional `modifiedTime`, `thumbnailLink`, `parentName`, and `relativePath`.

Public website:
- Current case data lives in `am-paginas-web-Gads/amesteticadental/src/data/casos.ts`.
- `/casos` uses `getCasosPublicados()` in `CasosClient.tsx`.
- `/casos/[slug]` uses `getCasoBySlug()` and static params.
- Existing cases already use Cloudinary URLs with `q_auto,f_auto`.
- Existing public case shape includes `slug`, `titulo`, `subtitulo`, `descripcion`, `seoTitle`, `seoDescription`, `categorias`, `duracion`, `piezas`, `tecnica`, `fotoPortada`, `fotos`, `copy`, optional video and price fields, and `publicado`.

## Product Decisions Locked

- Public cases from the app appear in the same `/casos` grid as current cases.
- The public user should not see whether the case came from the manual repo dataset or from the app.
- Internally, each case keeps an origin marker: `manual` or `app`.
- Publishing does not require owner approval.
- Reception, admin, and marketing can publish.
- Consent is operationally assumed when someone publishes. No blocking consent checkbox.
- Optional internal notes can exist for authorization or editorial context.
- Metadata rewriting applies only to selected assets, not entire patient folders.
- Original Drive metadata is not clinically important except capture date/time when present.
- Preserve capture date/time when possible.
- Do not put patient identity into public metadata, filenames, alt text, captions, or slugs.

## Surfaces

Internal app surfaces:
- Patient detail Drive/gallery tab.
- Photo Studio modal.
- New case publishing tray/modal.
- New internal case editor/list for drafts and published cases.

Server/actions:
- Cloudinary upload action.
- selected Drive asset download/read action.
- metadata preparation helper.
- case draft create/update/publish actions.
- case list/read actions for internal review.

Supabase:
- `public_clinical_cases`
- `public_clinical_case_assets`
- optional audit table or event rows.

Public website:
- `/casos`
- `/casos/[slug]`
- shared case data adapter that merges static cases and app-published cases.

External services:
- Google Drive as source of clinical assets.
- Cloudinary as public asset host.
- Supabase as dynamic case source.

## Data Model

### `public_clinical_cases`

Fields:
- `id uuid primary key`
- `source text not null default 'app'`
- `patient_id uuid null`
- `slug text unique not null`
- `status text not null` with values: `draft`, `published`, `unpublished`
- `title text not null`
- `subtitle text null`
- `description text not null`
- `seo_title text null`
- `seo_description text null`
- `categories text[] not null default '{}'`
- `duration text null`
- `pieces text null`
- `technique text null`
- `copy text not null`
- `copy_social text null`
- `doctor_name text null`
- `internal_notes text null`
- `published_at timestamptz null`
- `created_by uuid null`
- `updated_by uuid null`
- `published_by uuid null`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Rules:
- Public website only reads `status = 'published'`.
- `patient_id` is never exposed to the public API.
- `slug` must be anonymized and SEO-focused.

### `public_clinical_case_assets`

Fields:
- `id uuid primary key`
- `case_id uuid not null references public_clinical_cases(id)`
- `source_drive_file_id text null`
- `source_drive_name text null`
- `source_drive_created_time timestamptz null`
- `asset_type text not null` with values: `image`, `video`, `model_3d`, `link`
- `role text not null` with values: `cover`, `before`, `after`, `detail`, `process`, `lab`, `model_3d`, `result`, `other`
- `cloudinary_public_id text null`
- `cloudinary_url text null`
- `cloudinary_secure_url text null`
- `public_url text not null`
- `alt text not null`
- `caption text null`
- `metadata jsonb not null default '{}'`
- `sort_order integer not null default 0`
- `created_at timestamptz not null default now()`

Rules:
- Cover image is the first asset with `role = 'cover'`.
- If no cover exists, the first image by `sort_order` is used as fallback.
- Public website reads `public_url`, `alt`, `caption`, `role`, and `sort_order`.

## Metadata Rules

For selected images:
- Generate a publication filename from treatment/category/location, not patient name.
- Generate Cloudinary folder path under `casos/<case-slug>/`.
- Apply Cloudinary context/metadata:
  - `alt`
  - `caption`
  - `title`
  - `case_slug`
  - `category`
  - `role`
  - `clinic=AM Estetica Dental`
  - `location=Puerto Madero, Buenos Aires`
  - `doctor` when known or manually set
- Apply Cloudinary tags:
  - `casos`
  - `am-estetica-dental`
  - category/treatment tags
  - role tag

For embedded image metadata:
- Preserve capture date/time where extractable.
- Rewrite title, description, author/clinic, copyright, keywords, and general clinic location when technically supported by the image pipeline.
- Do not include patient name, DNI, email, phone, or folder name in public metadata.

## Flow

### 1. Select assets

In `PatientDriveTab`, add selection mode:
- checkbox/selection affordance per `DriveFileCard`
- selected asset counter
- button: `Crear caso web`

Selection supports initially:
- images

Later:
- videos
- 3D files as linked/preview assets

### 2. Prepare assets

Selected images enter a publishing tray:
- thumbnails
- drag reorder
- role assignment: cover, before, after, detail, process, lab, result, other
- open Photo Studio for crop/enhancement
- save edited output as publication version

Do not require processing every selected photo through Photo Studio. Use original image if no edit is needed.

### 3. Draft case

Case editor fields:
- title
- subtitle
- description
- categories
- duration
- pieces
- technique
- copy
- seo title
- seo description
- internal notes
- slug preview

Required before publish:
- slug
- title
- description
- at least one image
- cover image or fallback image
- alt text for every public image

### 4. Upload to Cloudinary

On save/publish:
- download selected Drive image or use Photo Studio output
- normalize filename
- embed metadata when supported
- upload to Cloudinary path `casos/<case-slug>/<ordered-file-name>`
- store Cloudinary public ID and secure URL in Supabase
- verify the resulting URL returns 200 before marking the asset ready

### 5. Publish

When user presses `Publicar en web`:
- validate required case fields
- validate at least one ready image asset
- set `status = 'published'`
- set `published_at`
- set `published_by`
- public web starts showing it automatically

### 6. Unpublish/edit

Authorized users can:
- edit text/metadata
- reorder assets
- unpublish
- republish

Unpublishing sets `status = 'unpublished'`. It does not delete Cloudinary assets.

## Public Website Integration

The website keeps current static cases and adds dynamic cases.

Adapter:
- Convert Supabase dynamic rows into the same `Caso` shape used by `src/data/casos.ts`.
- Merge:
  - static `CASOS`
  - dynamic published cases
- Sort by:
  - `published_at desc` for dynamic cases
  - existing static order for legacy cases unless a static `publishedAt` is added later

`/casos`:
- same grid.
- same filters.
- no visual distinction by source.

`/casos/[slug]`:
- lookup static first or dynamic first by slug with collision prevention.
- dynamic routes must not rely only on `generateStaticParams`; page should support runtime dynamic slugs for app-published cases.

SEO:
- metadata generated from dynamic case fields.
- same JSON-LD structure as current case detail.
- Cloudinary URLs must include or support `q_auto,f_auto`.

## Permissions

Create a publish capability, not just broad role checks.

Initial allowed roles:
- owner
- admin
- reception
- marketing

Operations:
- create draft: allowed roles
- edit draft: allowed roles
- publish: allowed roles
- unpublish: owner/admin/marketing initially; reception can publish but unpublish should be admin/owner/marketing unless explicitly broadened later
- audit: owner/admin

If existing access override system can support module permissions, add capability key:
- `clinical_case_publishing`

## Invariants

- Do not expose patient identity in public case rows or metadata.
- Do not publish directly from raw Drive folder without selected assets.
- Cloudinary is the public asset source.
- Google Drive remains the clinical source repository.
- Only selected assets are processed.
- Preserve capture timestamp when available.
- Current manually coded cases must keep working.
- Public `/casos` remains the canonical page.
- Cloudinary image URLs must be verified before publish.

## Non-Goals For First Build

- Fully interactive public 3D model viewer.
- Automatic AI case writing without human review.
- Rewriting metadata for entire patient folders.
- Migrating all existing static cases into Supabase.
- Deleting Cloudinary assets on unpublish.
- Requiring owner-only approval.
- Adding a blocking consent checkbox.

## First Implementation Phase

Build the minimum useful bridge:

1. Supabase tables for app-published case drafts and assets.
2. Internal case publishing tray from selected Drive images.
3. Cloudinary upload action for selected images.
4. Required metadata generation and storage.
5. Publish/unpublish action.
6. Website adapter that merges static and dynamic published cases.

This creates a working end-to-end path without solving public 3D streaming on day one.

## Capability Contract

Capability:
- Authorized clinic users can transform selected patient media into public clinical cases without developer intervention.

Surfaces:
- patient Drive/gallery tab
- Photo Studio
- case publishing tray/editor
- Supabase case tables
- Cloudinary upload pipeline
- public `/casos` and `/casos/[slug]`

Data implications:
- New Supabase public-case tables.
- Cloudinary credentials in app server environment.
- Public website needs Supabase read access or API endpoint for published cases.
- RLS must prevent patient-linked private data exposure.

Open questions:
- None blocking. Defaults are set by product decisions above.

Handoff:
- Ready for implementation planning.
