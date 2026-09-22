from modules.coreX.coreX import CoreX

service = CoreX()


def health() -> dict:
    return service.health()
