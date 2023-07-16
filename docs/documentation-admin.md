# Polkastarter - Staking v2 - Documentation Admin



### userStakeAmountMax

The function `userStakeAmountMax` can be used to set a maximum amount an account can stake. The maximum is only checked at the time when a user wants to stake additional funds, otherwise it does not affect or enforce any other actions.

Setting the `userStakeAmountMax` to a low value allows funding to gradually start after the launch of a new version. Setting `userStakeAmountMax = 0` actually prevents any additional staking and may be used to phase out an old version where only withdrawal of funds is allowed.



