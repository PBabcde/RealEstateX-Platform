from typing import Dict

from modules.phase2_base import module_result


class AnalyticsX:
    def dashboard(self, visitors: int = 0, deals: int = 0, leads: int = 0, market_points: int = 0) -> dict:
        conversion = (deals / visitors * 100) if visitors else 0
        lead_rate = (leads / visitors * 100) if visitors else 0
        return module_result("AnalyticsX", {
            "visitors": visitors, "deals": deals, "leads": leads, "marketDataPoints": market_points,
            "conversion": round(conversion, 2), "leadRate": round(lead_rate, 2),
        })