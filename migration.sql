CREATE TABLE IF NOT EXISTS teacher_analytics_visibility (
    teacher_user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    github_enabled BOOLEAN DEFAULT TRUE,
    linkedin_enabled BOOLEAN DEFAULT TRUE,
    hackerrank_enabled BOOLEAN DEFAULT TRUE,
    hackathon_enabled BOOLEAN DEFAULT TRUE,
    academic_enabled BOOLEAN DEFAULT TRUE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_by UUID REFERENCES users(id)
);
