from typing import Any, Dict

from modules.realestateX.realestate_storageX import RealEstateStorageX
from modules.realestateX.rentalX import RentalX

storage = RealEstateStorageX()
module = RentalX()


def rental_overview(data: Dict[str, Any]) -> dict:
    result = module.rental_overview(data)
    storage.save_rentals({"last": {"input": data, "result": result}})
    return result
