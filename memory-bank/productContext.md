## Product Context

- **Users**: Real users looking to speed date and match with others through video calls
- **Problem**: Users need a reliable, fast, and fair matching system that connects compatible people for speed dating sessions with real-time video capabilities
- **Experience goals**:
  - **Onboarding**: Complete profile setup with photos, bio, location, age preferences, and matching filters
  - **Dashboard**: View profile, stats, and access main features (spin, video dates, match history)
  - **Spin Flow**: Press spin → Join queue → Get matched → See partner → Vote (yes/pass) → Outcome determined
  - **Voting Window**: Time-limited window (60 seconds) to vote, with automatic resolution of expired votes
  - **Video Date**: Real-time video call using LiveKit when both users vote "yes"
  - **Matching Logic**: Fair matching based on preferences (age, location, gender), with priority for long-waiting users
  - **State Management**: Robust state machine (idle → waiting → matched) with disconnect handling
- **Success metrics**: 
  - Fast matching (<500ms spin response)
  - 100% reliability (no race conditions, stuck matches, or state inconsistencies)
  - Fair matching (respects wait times, preferences, and prevents rematches)
  - Smooth video experience with LiveKit integration
  - Handles high load (tested with 500+ concurrent users)
