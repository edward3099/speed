-- ============================================================================
-- State Transition Validation Trigger
-- ============================================================================
-- Phase 3.3: Validates state transitions are legal
-- ============================================================================

-- Function to validate state transitions
CREATE OR REPLACE FUNCTION validate_state_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Only validate if state actually changed
  IF OLD.state = NEW.state THEN
    RETURN NEW;
  END IF;
  
  -- Define valid state transitions
  -- idle → waiting (spin)
  IF OLD.state = 'idle' AND NEW.state NOT IN ('waiting', 'idle') THEN
    RAISE EXCEPTION 'Invalid transition from idle to %. Valid transitions: waiting, idle', NEW.state;
  END IF;
  
  -- waiting → paired (matched)
  IF OLD.state = 'waiting' AND NEW.state NOT IN ('paired', 'idle', 'waiting') THEN
    RAISE EXCEPTION 'Invalid transition from waiting to %. Valid transitions: paired, idle, waiting', NEW.state;
  END IF;
  
  -- paired → vote_window (acknowledged)
  IF OLD.state = 'paired' AND NEW.state NOT IN ('vote_window', 'idle', 'paired') THEN
    RAISE EXCEPTION 'Invalid transition from paired to %. Valid transitions: vote_window, idle, paired', NEW.state;
  END IF;
  
  -- vote_window → idle or video_date (outcome resolved)
  IF OLD.state = 'vote_window' AND NEW.state NOT IN ('idle', 'video_date', 'vote_window') THEN
    RAISE EXCEPTION 'Invalid transition from vote_window to %. Valid transitions: idle, video_date, vote_window', NEW.state;
  END IF;
  
  -- video_date → ended or idle
  IF OLD.state = 'video_date' AND NEW.state NOT IN ('ended', 'idle', 'video_date') THEN
    RAISE EXCEPTION 'Invalid transition from video_date to %. Valid transitions: ended, idle, video_date', NEW.state;
  END IF;
  
  -- ended → idle (can reset)
  IF OLD.state = 'ended' AND NEW.state NOT IN ('idle', 'ended') THEN
    RAISE EXCEPTION 'Invalid transition from ended to %. Valid transitions: idle, ended', NEW.state;
  END IF;
  
  -- Allow staying in same state (no-op transitions)
  -- This is already handled by the early return above
  
  RETURN NEW;
END;
$$;

-- Create trigger
DROP TRIGGER IF EXISTS trigger_validate_state_transition ON users_state;
CREATE TRIGGER trigger_validate_state_transition
BEFORE UPDATE ON users_state
FOR EACH ROW
EXECUTE FUNCTION validate_state_transition();

COMMENT ON FUNCTION validate_state_transition IS 'Validates state transitions are legal - prevents invalid states at database level';
COMMENT ON TRIGGER trigger_validate_state_transition ON users_state IS 'Validates state transitions before update';

