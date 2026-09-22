from modules.diyX.diyX import DIYX

service = DIYX()


def plan(project_type: str, budget: float = 0) -> dict:
    return service.plan(project_type, budget)
