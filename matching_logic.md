matching logic

this document describes how the speed date pairing system works. users remain in spin active until the system assigns a partner. no spin fails. no timeouts. the front end shows a spinning motion while the back end manages the queue.

states

spin active
user pressed spin and is waiting for a partner. animation loops until a match is found.

queue waiting
user is in the matching queue. the system searches for the best partner.

paired
two users are assigned to each other. the spin animation stops and reveal begins.

vote active
both users see each other and choose yes or respin.

video date
both users voted yes and enter a timed video session.

core idea

when a user presses spin

they enter the queue

they stay matchable until paired

there is no window expiry

no user is left out

the front end keeps showing spinning

once a partner is found, reveal begins

every spin leads to a pairing. there are no empty results.

queue behaviour

every user who presses spin joins the queue.

queue entries include

time joined

age preference

gender preference

location preference

fairness score

users remain in the queue until they are matched. once they match, both leave the queue.

pairing rules

pairing follows clear steps.

rule one
match the newest spinner with the best waiting partner in the queue.

best partner means

compatible preferences

healthy fairness score

longer waiting time

good match score

rule two
apply preference filters first.

rule three
if user waits too long, expand preferences gently.

rule four
once paired, both users exit the queue.

rule five
no user can appear for more than one person at the same time.

pairing priority

the system uses this priority order.

one
fairness boost
users who waited long or were skipped earlier get higher priority.

two
preference strength
exact matches rank highest. expanded matches rank lower.

three
queue time
longer waiting users move first.

four
match score
additional factors can improve pairing in future versions.

reveal and voting

once two users are paired

spin animation stops

both profiles appear

both users enter vote active

both choose yes or respin inside a short voting window

during this time they are locked and cannot match anyone else.

voting behaviour

the platform supports three situations.

both vote yes
both users enter a video date.
session has a countdown.
after the session they may exchange contact details.

one votes yes and the other votes respin
the pair is ended immediately.
both users leave vote active.
both return to spin and re enter the queue.
the yes voter receives a priority boost.
the respin voter does not receive a boost.
no negative feedback is shown.

one user votes respin before the other has voted
the system ends the pairing instantly.
there is no waiting.
both users leave vote active and return to spin.
only the respin voter decision is processed.
no boost is given unless the other user had already voted yes.
if the other user had not voted yet, they return with normal priority.

this prevents stalling and keeps flow fast and fair.

fairness system

the fairness system prevents long waits and unfair loops.

fairness score increases when

user waits longer than others

user has narrow preferences

queue is low and matching is slow

user was skipped in past cycles

fairness score resets when

user is matched

user completes a video date

user leaves the session

the system ensures everyone eventually reaches the front of the queue.

preference expansion

if a user waits too long with no match

age range expands slightly

location radius expands slightly

secondary compatible genders are considered

preferences expand only when needed and in small steps.

end to end journey

one
user presses spin

two
user enters the queue

three
front end shows continuous spinning and shuffling visuals

four
system finds the best partner using fairness rules and preference filters

five
match is created and reveal begins

six
voting starts

seven
if both vote yes
video date begins

eight
if one votes respin
both return to spin and re enter the queue
yes voter gets priority boost

emotional design

this system ensures

no rejection moments

no dead spins

smooth and kind experience

fair matching for all users

fast transitions

no waiting confusion

high match frequency

the process remains calm, predictable and user friendly.