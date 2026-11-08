"""The two pit-stop times the strategy card keeps apart.

``pit lane duration``
    Pit entry to pit exit, stationary time included, as the feed's
    ``PitLaneTimeCollection`` announces it. **Observed**, shown for reference.
``net pit loss``
    How much more time the stop costs than staying out: the pit lane duration
    minus the time the car would have taken over the same stretch of track.
    The feed does not report it and nothing here derives it, so it is an
    **assumption** the viewer sets. Only the net loss moves a car's gap.
"""

# A "stop" outside this range is a drive-through, a repair or a red-flag wait.
MIN_STOP_S = 12.0
MAX_STOP_S = 45.0
MIN_STOPS_FOR_MEDIAN = 3

# A generic, explicitly labelled starting assumption; not a figure for any circuit.
DEFAULT_NET_PIT_LOSS = 20.0
NET_PIT_LOSS_NOTE = (
    "Net pit loss is how much longer a stop takes than staying out: the pit lane "
    "time minus the time the same stretch takes on track. The timing feed does not "
    "report it and it is not measured here, so it is an assumption: "
    f"{DEFAULT_NET_PIT_LOSS:.0f} s is a generic starting point, not a figure for "
    "this circuit."
)
