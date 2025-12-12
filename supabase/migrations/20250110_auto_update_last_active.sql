-- ============================================================================
-- Auto-Update last_active Trigger
-- ============================================================================
-- Phase 3.2: Automatically update last_active on every users_state update
-- ============================================================================

-- Function to auto-update last_active
CREATE OR REPLACE FUNCTION update_last_active()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Set last_active to current timestamp on every update
  NEW.last_active := NOW();
  RETURN NEW;
END;
$$;

-- Create trigger
DROP TRIGGER IF EXISTS trigger_update_last_active ON users_state;
CREATE TRIGGER trigger_update_last_active
BEFORE UPDATE ON users_state
FOR EACH ROW
EXECUTE FUNCTION update_last_active();

COMMENT ON FUNCTION update_last_active IS 'Automatically updates last_active timestamp on every users_state update - ensures online status is always current';
COMMENT ON TRIGGER trigger_update_last_active ON users_state IS 'Updates last_active before every update to users_state';

