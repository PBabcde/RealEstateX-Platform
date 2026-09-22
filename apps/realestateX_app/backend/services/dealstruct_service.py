from modules.dealStructX.dealStructX import DealStructX

service = DealStructX()


def advise(scenario: str) -> dict:
    return service.advise(scenario)
