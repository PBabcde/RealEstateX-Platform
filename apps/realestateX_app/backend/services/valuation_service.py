from typing import Any, Dict

from modules.realestateX.realestate_storageX import RealEstateStorageX
from modules.realestateX.valuationX import ValuationX

storage = RealEstateStorageX()
module = ValuationX()


def calculate_valuation(data: Dict[str, Any]) -> dict:
    result = module.calculate(data)
    storage.save_valuations({"last": {"input": data, "result": result}})
    return result
