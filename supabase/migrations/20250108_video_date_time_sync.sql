-- ============================================================================
-- Video Date Time Synchronization
-- ============================================================================
-- This migration adds:
-- 1. Trigger to automatically set started_at when status changes to 'active'
-- 2. RPC function to calculate remaining time for synchronized timers
-- ============================================================================

-- Function to set started_at when status changes to 'active'
CREATE OR REPLACE FUNCTION set_video_date_started_at()
RETURNS TRIGGER AS $$
BEGIN
  -- Only set started_at if status is 'active' and started_at is NULL
  IF NEW.status = 'active' AND OLD.status != 'active' AND NEW.started_at IS NULL THEN
    NEW.started_at := NOW();
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on video_dates table
DROP TRIGGER IF EXISTS video_date_set_started_at_trigger ON video_dates;
CREATE TRIGGER video_date_set_started_at_trigger
  BEFORE UPDATE ON video_dates
  FOR EACH ROW
  WHEN (NEW.status = 'active' AND (OLD.status IS NULL OR OLD.status != 'active'))
  EXECUTE FUNCTION set_video_date_started_at();

-- RPC function to calculate remaining time for synchronized timer
-- This ensures both users see the same time by using database NOW()
CREATE OR REPLACE FUNCTION get_video_date_time_remaining(
  p_video_date_id UUID
)
RETURNS INTEGER AS $$
DECLARE
  v_started_at TIMESTAMP WITH TIME ZONE;
  v_status TEXT;
  v_remaining_seconds INTEGER;
BEGIN
  -- Get started_at and status from video_dates
  SELECT started_at, status
  INTO v_started_at, v_status
  FROM video_dates
  WHERE id = p_video_date_id;
  
  -- If record not found, return NULL
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  
  -- If status is not 'active', return NULL (timer not started)
  IF v_status != 'active' THEN
    RETURN NULL;
  END IF;
  
  -- If started_at is NULL, return NULL (timer not started)
  IF v_started_at IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Calculate remaining seconds (5 minutes = 300 seconds)
  -- Use database NOW() for perfect synchronization
  v_remaining_seconds := GREATEST(0, 300 - EXTRACT(EPOCH FROM (NOW() - v_started_at))::INTEGER);
  
  RETURN v_remaining_seconds;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC function to calculate remaining countdown time (15 seconds)
-- This ensures both users see the same countdown by using database NOW()
CREATE OR REPLACE FUNCTION get_video_date_countdown_remaining(
  p_video_date_id UUID
)
RETURNS INTEGER AS $$
DECLARE
  v_countdown_started_at TIMESTAMP WITH TIME ZONE;
  v_status TEXT;
  v_remaining_seconds INTEGER;
BEGIN
  -- Get countdown_started_at and status from video_dates
  SELECT countdown_started_at, status
  INTO v_countdown_started_at, v_status
  FROM video_dates
  WHERE id = p_video_date_id;
  
  -- If record not found, return NULL
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  
  -- If status is not 'countdown', return 0 (countdown complete)
  IF v_status != 'countdown' THEN
    RETURN 0;
  END IF;
  
  -- If countdown_started_at is NULL, return NULL
  IF v_countdown_started_at IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Calculate remaining seconds (15 seconds countdown)
  -- Use database NOW() for perfect synchronization
  v_remaining_seconds := GREATEST(0, 15 - EXTRACT(EPOCH FROM (NOW() - v_countdown_started_at))::INTEGER);
  
  RETURN v_remaining_seconds;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_video_date_time_remaining(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_video_date_countdown_remaining(UUID) TO authenticated;

COMMENT ON FUNCTION get_video_date_time_remaining(UUID) IS 'Calculate remaining time for video date timer (5 minutes) using database NOW() for perfect synchronization';
COMMENT ON FUNCTION get_video_date_countdown_remaining(UUID) IS 'Calculate remaining time for video date countdown (15 seconds) using database NOW() for perfect synchronization';
COMMENT ON FUNCTION set_video_date_started_at() IS 'Trigger function to automatically set started_at when video date status changes to active';

