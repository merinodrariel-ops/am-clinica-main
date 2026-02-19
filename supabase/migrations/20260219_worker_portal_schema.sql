-- Create enum for payment models
CREATE TYPE payment_model_type AS ENUM ('hourly', 'commission', 'fixed', 'hybrid');

-- Create enum for worker roles (extending potentially existing roles concept, but specific to this portal)
-- Note: We might already have roles in auth or profiles, but this is specific for the worker profile business logic
CREATE TYPE worker_role_type AS ENUM ('dentist', 'assistant', 'technician', 'cleaning', 'admin', 'reception', 'other');

-- WORKER PROFILES
CREATE TABLE worker_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id), -- Optional link to auth user
    full_name TEXT NOT NULL,
    role worker_role_type NOT NULL DEFAULT 'other',
    specialty TEXT,
    photo_url TEXT,
    
    -- Financial Configuration
    payment_model payment_model_type DEFAULT 'fixed',
    hourly_rate DECIMAL(10, 2), -- For hourly model
    commission_percentage DECIMAL(5, 2), -- For commission model (0-100)
    fixed_salary DECIMAL(10, 2), -- For fixed model
    
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'on_leave')),
    hire_date DATE DEFAULT CURRENT_DATE,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- WORK LOGS (For tracking time, procedures, or completion of tasks)
CREATE TABLE work_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    worker_id UUID REFERENCES worker_profiles(id) NOT NULL,
    date DATE DEFAULT CURRENT_DATE NOT NULL,
    
    -- Type of work: 'shift' (time), 'procedure' (commission), 'bonus', 'deduction'
    type TEXT NOT NULL CHECK (type IN ('shift', 'procedure', 'task', 'bonus', 'deduction')),
    
    -- Details
    reference_id TEXT, -- e.g., appointment_id or task_id
    description TEXT,
    
    -- Quantifiables
    duration_minutes INTEGER, -- For hourly work
    amount_calculated DECIMAL(10, 2), -- The monetary value generated or owed
    
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'paid', 'rejected')),
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- BADGES / ACHIEVEMENTS
CREATE TABLE achievements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT UNIQUE NOT NULL, -- e.g., 'fast_response', 'top_earner'
    name TEXT NOT NULL,
    description TEXT,
    icon_url TEXT,
    category TEXT DEFAULT 'general',
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- WORKER ACHIEVEMENTS (Many-to-Many)
CREATE TABLE worker_achievements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    worker_id UUID REFERENCES worker_profiles(id) NOT NULL,
    achievement_id UUID REFERENCES achievements(id) NOT NULL,
    awarded_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(worker_id, achievement_id) -- Prevent duplicate badges of same type if not desired? Or maybe allow multiple 'Employee of the Month'
);

-- Enable RLS
ALTER TABLE worker_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE worker_achievements ENABLE ROW LEVEL SECURITY;

-- POLICIES (Simple start: Admin sees all, User sees own)

-- worker_profiles
CREATE POLICY "Admins can manage worker profiles" ON worker_profiles
    FOR ALL
    USING (
        auth.uid() IN (
            SELECT id FROM public.users WHERE role IN ('admin', 'owner') -- Assuming public.users table exists with roles
        )
    );

CREATE POLICY "Workers can view own profile" ON worker_profiles
    FOR SELECT
    USING (auth.uid() = user_id);

-- work_logs
CREATE POLICY "Admins can manage work logs" ON work_logs
    FOR ALL
    USING (
        auth.uid() IN (
            SELECT id FROM public.users WHERE role IN ('admin', 'owner')
        )
    );

CREATE POLICY "Workers can view own logs" ON work_logs
    FOR SELECT
    USING (worker_id IN (SELECT id FROM worker_profiles WHERE user_id = auth.uid()));

-- achievements are public read
CREATE POLICY "Everyone can view achievements" ON achievements
    FOR SELECT
    USING (true);

-- worker_achievements
CREATE POLICY "Public view earned badges" ON worker_achievements
    FOR SELECT
    USING (true);
