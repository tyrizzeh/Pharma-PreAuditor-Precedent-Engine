-- =============================================================================
-- FDA Whisperer: Regulatory Precedents Vector Store
-- Run: psql -f db_schema.sql or apply via Supabase Dashboard SQL Editor
-- Deep Regulatory RAG - Supabase + pgvector
-- =============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

-- =============================================================================
-- CORE TABLE: regulatory_precedents
-- Stores chunks from SBAs (Summary Basis of Approvals) and EMA EPARs
-- =============================================================================
CREATE TABLE IF NOT EXISTS regulatory_precedents (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    content         TEXT NOT NULL,
    embedding       vector(1536) NOT NULL,
    
    -- Source provenance
    source_document TEXT,
    source_page     INTEGER,
    chunk_index     INTEGER,
    
    -- Structured metadata for filtering and faceted search
    drug_class      TEXT,
    therapeutic_area TEXT,
    review_type     TEXT CHECK (review_type IN ('Medical', 'CMC', 'Pharmacology', 'Clinical', 'Nonclinical', 'Other')),
    reviewer_sentiment TEXT CHECK (reviewer_sentiment IN ('Positive', 'Concerned', 'Critical', 'Neutral', 'Unspecified')),
    
    -- Regulatory-specific metadata
    jurisdiction    TEXT CHECK (jurisdiction IN ('FDA', 'EMA', 'PMDA', 'Other')),
    application_type TEXT,
    approval_year   INTEGER,
    
    -- Extracted by pdf_processor.ts
    contains_table  BOOLEAN DEFAULT FALSE,
    rtf_keywords_detected TEXT[],
    
    -- Timestamps
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- HNSW index for vector similarity (cosine)
CREATE INDEX IF NOT EXISTS idx_regulatory_precedents_embedding 
ON regulatory_precedents USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- Metadata indexes for multi-angle search
CREATE INDEX IF NOT EXISTS idx_regulatory_precedents_drug_class ON regulatory_precedents (drug_class);
CREATE INDEX IF NOT EXISTS idx_regulatory_precedents_therapeutic_area ON regulatory_precedents (therapeutic_area);
CREATE INDEX IF NOT EXISTS idx_regulatory_precedents_review_type ON regulatory_precedents (review_type);
CREATE INDEX IF NOT EXISTS idx_regulatory_precedents_reviewer_sentiment ON regulatory_precedents (reviewer_sentiment);
CREATE INDEX IF NOT EXISTS idx_regulatory_precedents_jurisdiction ON regulatory_precedents (jurisdiction);
CREATE INDEX IF NOT EXISTS idx_regulatory_precedents_contains_table ON regulatory_precedents (contains_table) WHERE contains_table = TRUE;
CREATE INDEX IF NOT EXISTS idx_regulatory_precedents_rtf_keywords ON regulatory_precedents USING GIN (rtf_keywords_detected) WHERE rtf_keywords_detected IS NOT NULL AND array_length(rtf_keywords_detected, 1) > 0;

-- Full-text search
ALTER TABLE regulatory_precedents ADD COLUMN IF NOT EXISTS content_tsv tsvector 
    GENERATED ALWAYS AS (to_tsvector('english', content)) STORED;
CREATE INDEX IF NOT EXISTS idx_regulatory_precedents_content_fts ON regulatory_precedents USING GIN (content_tsv);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trigger_regulatory_precedents_updated_at ON regulatory_precedents;
CREATE TRIGGER trigger_regulatory_precedents_updated_at
    BEFORE UPDATE ON regulatory_precedents FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Vector similarity RPC
CREATE OR REPLACE FUNCTION match_regulatory_precedents(
    query_embedding vector(1536), match_threshold FLOAT DEFAULT 0.7, match_count INT DEFAULT 10,
    filter_drug_class TEXT DEFAULT NULL, filter_review_type TEXT DEFAULT NULL, filter_jurisdiction TEXT DEFAULT NULL
)
RETURNS TABLE (id UUID, content TEXT, similarity FLOAT, drug_class TEXT, therapeutic_area TEXT, review_type TEXT, reviewer_sentiment TEXT)
LANGUAGE plpgsql AS $$
BEGIN
    RETURN QUERY SELECT rp.id, rp.content, 1 - (rp.embedding <=> query_embedding),
        rp.drug_class, rp.therapeutic_area, rp.review_type, rp.reviewer_sentiment
    FROM regulatory_precedents rp
    WHERE 1 - (rp.embedding <=> query_embedding) > match_threshold
        AND (filter_drug_class IS NULL OR rp.drug_class = filter_drug_class)
        AND (filter_review_type IS NULL OR rp.review_type = filter_review_type)
        AND (filter_jurisdiction IS NULL OR rp.jurisdiction = filter_jurisdiction)
    ORDER BY rp.embedding <=> query_embedding LIMIT match_count;
END;
$$;
