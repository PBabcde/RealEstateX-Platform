from modules.riskX.riskX import RiskX

service = RiskX()


def assess(market: float = 40, interest: float = 40, vacancy: float = 40, transformation: float = 40) -> dict:
    return service.assess(market, interest, vacancy, transformation)
