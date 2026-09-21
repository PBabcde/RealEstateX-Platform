from modules.realestateX.mortgageX import MortgageX
from modules.realestateX.realestate_storageX import RealEstateStorageX

storage = RealEstateStorageX()
module = MortgageX()


def calculate_mortgage(principal: float, interest: float, years: int) -> dict:
    result = module.calculate(principal, interest, years)
    storage.save_mortgages(
        {
            "last": {
                "input": {
                    "principal": principal,
                    "interest": interest,
                    "years": years,
                },
                "result": result,
            }
        }
    )
    return result
