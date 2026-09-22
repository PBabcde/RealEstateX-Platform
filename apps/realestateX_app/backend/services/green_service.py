from modules.greenX.greenX import GreenX

service = GreenX()


def assess(energielabel: str = "C", area: float = 0) -> dict:
    return service.assess(energielabel, area)
