from modules.analyticsX.analyticsX import AnalyticsX

service = AnalyticsX()


def dashboard(visitors: int = 0, deals: int = 0, leads: int = 0, market_points: int = 0) -> dict:
    return service.dashboard(visitors, deals, leads, market_points)
