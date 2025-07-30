/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/simple_vault.json`.
 */
export type SimpleVault = {
  "address": "EHiKn3J5wywNG2rHV2Qt74AfNqtJajhPerkVzYXudEwn",
  "metadata": {
    "name": "simpleVault",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Simple Insurance Fund Vault"
  },
  "instructions": [
    {
      "name": "addRewards",
      "docs": [
        "Add rewards to the vault (only owner/admin)"
      ],
      "discriminator": [
        88,
        186,
        25,
        227,
        38,
        137,
        81,
        23
      ],
      "accounts": [
        {
          "name": "vault",
          "writable": true
        },
        {
          "name": "vaultTokenAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116,
                  95,
                  116,
                  111,
                  107,
                  101,
                  110,
                  95,
                  97,
                  99,
                  99,
                  111,
                  117,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "vault"
              }
            ]
          }
        },
        {
          "name": "rewardSourceAccount",
          "writable": true
        },
        {
          "name": "platformTokenAccount",
          "writable": true
        },
        {
          "name": "rewardSourceAuthority",
          "signer": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "applyRebase",
      "docs": [
        "Apply rebase to vault (only vault owner)"
      ],
      "discriminator": [
        161,
        115,
        9,
        131,
        136,
        29,
        147,
        155
      ],
      "accounts": [
        {
          "name": "vault",
          "writable": true
        },
        {
          "name": "owner",
          "signer": true
        }
      ],
      "args": []
    },
    {
      "name": "cancelUnstakeRequest",
      "docs": [
        "Cancel unstake request"
      ],
      "discriminator": [
        146,
        92,
        252,
        229,
        122,
        129,
        37,
        141
      ],
      "accounts": [
        {
          "name": "vault",
          "writable": true
        },
        {
          "name": "vaultDepositor",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116,
                  95,
                  100,
                  101,
                  112,
                  111,
                  115,
                  105,
                  116,
                  111,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "vault"
              },
              {
                "kind": "account",
                "path": "authority"
              }
            ]
          }
        },
        {
          "name": "authority",
          "signer": true
        }
      ],
      "args": []
    },
    {
      "name": "initializeVault",
      "docs": [
        "Initialize the vault"
      ],
      "discriminator": [
        48,
        191,
        163,
        44,
        71,
        129,
        63,
        164
      ],
      "accounts": [
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "arg",
                "path": "params.name"
              }
            ]
          }
        },
        {
          "name": "owner",
          "writable": true,
          "signer": true
        },
        {
          "name": "tokenMint"
        },
        {
          "name": "vaultTokenAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116,
                  95,
                  116,
                  111,
                  107,
                  101,
                  110,
                  95,
                  97,
                  99,
                  99,
                  111,
                  117,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "vault"
              }
            ]
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "rent",
          "address": "SysvarRent111111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "params",
          "type": {
            "defined": {
              "name": "initializeVaultParams"
            }
          }
        }
      ]
    },
    {
      "name": "initializeVaultDepositor",
      "docs": [
        "Initialize a vault depositor"
      ],
      "discriminator": [
        112,
        174,
        162,
        232,
        89,
        92,
        205,
        168
      ],
      "accounts": [
        {
          "name": "vault"
        },
        {
          "name": "vaultDepositor",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116,
                  95,
                  100,
                  101,
                  112,
                  111,
                  115,
                  105,
                  116,
                  111,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "vault"
              },
              {
                "kind": "account",
                "path": "authority"
              }
            ]
          }
        },
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "rent",
          "address": "SysvarRent111111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "requestUnstake",
      "docs": [
        "Request to unstake tokens (14 days lockup)"
      ],
      "discriminator": [
        44,
        154,
        110,
        253,
        160,
        202,
        54,
        34
      ],
      "accounts": [
        {
          "name": "vault",
          "writable": true
        },
        {
          "name": "vaultDepositor",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116,
                  95,
                  100,
                  101,
                  112,
                  111,
                  115,
                  105,
                  116,
                  111,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "vault"
              },
              {
                "kind": "account",
                "path": "authority"
              }
            ]
          }
        },
        {
          "name": "authority",
          "signer": true
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "stake",
      "docs": [
        "Stake tokens to the vault"
      ],
      "discriminator": [
        206,
        176,
        202,
        18,
        200,
        209,
        179,
        108
      ],
      "accounts": [
        {
          "name": "vault",
          "writable": true
        },
        {
          "name": "vaultDepositor",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116,
                  95,
                  100,
                  101,
                  112,
                  111,
                  115,
                  105,
                  116,
                  111,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "vault"
              },
              {
                "kind": "account",
                "path": "authority"
              }
            ]
          }
        },
        {
          "name": "vaultTokenAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116,
                  95,
                  116,
                  111,
                  107,
                  101,
                  110,
                  95,
                  97,
                  99,
                  99,
                  111,
                  117,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "vault"
              }
            ]
          }
        },
        {
          "name": "userTokenAccount",
          "writable": true
        },
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "syncRebase",
      "docs": [
        "Sync user shares with vault rebase"
      ],
      "discriminator": [
        149,
        113,
        39,
        145,
        73,
        114,
        91,
        42
      ],
      "accounts": [
        {
          "name": "vault"
        },
        {
          "name": "vaultDepositor",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116,
                  95,
                  100,
                  101,
                  112,
                  111,
                  115,
                  105,
                  116,
                  111,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "vault"
              },
              {
                "kind": "account",
                "path": "authority"
              }
            ]
          }
        },
        {
          "name": "authority",
          "signer": true
        }
      ],
      "args": []
    },
    {
      "name": "unstake",
      "docs": [
        "Execute unstake after lockup period"
      ],
      "discriminator": [
        90,
        95,
        107,
        42,
        205,
        124,
        50,
        225
      ],
      "accounts": [
        {
          "name": "vault",
          "writable": true
        },
        {
          "name": "vaultDepositor",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116,
                  95,
                  100,
                  101,
                  112,
                  111,
                  115,
                  105,
                  116,
                  111,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "vault"
              },
              {
                "kind": "account",
                "path": "authority"
              }
            ]
          }
        },
        {
          "name": "vaultTokenAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116,
                  95,
                  116,
                  111,
                  107,
                  101,
                  110,
                  95,
                  97,
                  99,
                  99,
                  111,
                  117,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "vault"
              }
            ]
          }
        },
        {
          "name": "userTokenAccount",
          "writable": true
        },
        {
          "name": "authority",
          "signer": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    },
    {
      "name": "updateVaultConfig",
      "docs": [
        "Update vault configuration (only owner)"
      ],
      "discriminator": [
        122,
        3,
        21,
        222,
        158,
        255,
        238,
        157
      ],
      "accounts": [
        {
          "name": "vault",
          "writable": true
        },
        {
          "name": "owner",
          "signer": true
        }
      ],
      "args": [
        {
          "name": "params",
          "type": {
            "defined": {
              "name": "updateVaultConfigParams"
            }
          }
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "vault",
      "discriminator": [
        211,
        8,
        232,
        43,
        2,
        152,
        117,
        119
      ]
    },
    {
      "name": "vaultDepositor",
      "discriminator": [
        87,
        109,
        182,
        106,
        87,
        96,
        63,
        211
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "insufficientFunds",
      "msg": "Insufficient funds"
    },
    {
      "code": 6001,
      "name": "invalidAmount",
      "msg": "Invalid amount"
    },
    {
      "code": 6002,
      "name": "unstakeLockupNotFinished",
      "msg": "Unstake lockup period not finished"
    },
    {
      "code": 6003,
      "name": "noUnstakeRequest",
      "msg": "No unstake request found"
    },
    {
      "code": 6004,
      "name": "unstakeRequestAlreadyExists",
      "msg": "Unstake request already exists"
    },
    {
      "code": 6005,
      "name": "invalidVaultConfig",
      "msg": "Invalid vault configuration"
    },
    {
      "code": 6006,
      "name": "unauthorized",
      "msg": "unauthorized"
    },
    {
      "code": 6007,
      "name": "vaultPaused",
      "msg": "Vault is paused"
    },
    {
      "code": 6008,
      "name": "invalidSharesCalculation",
      "msg": "Invalid shares calculation"
    },
    {
      "code": 6009,
      "name": "mathOverflow",
      "msg": "Math overflow"
    },
    {
      "code": 6010,
      "name": "divisionByZero",
      "msg": "Division by zero"
    },
    {
      "code": 6011,
      "name": "invalidTokenMint",
      "msg": "Invalid token mint"
    },
    {
      "code": 6012,
      "name": "invalidTokenAccount",
      "msg": "Invalid token account"
    },
    {
      "code": 6013,
      "name": "vaultIsFull",
      "msg": "Vault is full"
    },
    {
      "code": 6014,
      "name": "minimumStakeAmountNotMet",
      "msg": "Minimum stake amount not met"
    },
    {
      "code": 6015,
      "name": "noActiveShares",
      "msg": "No active shares available for price reference"
    },
    {
      "code": 6016,
      "name": "stakeCooldownNotMet",
      "msg": "Stake cooldown period not met (MEV protection)"
    },
    {
      "code": 6017,
      "name": "invariantViolation",
      "msg": "Vault state invariant violation - critical accounting error"
    },
    {
      "code": 6018,
      "name": "cannotStakeWhenAllSharesPending",
      "msg": "Cannot stake when all shares are pending unstake"
    },
    {
      "code": 6019,
      "name": "insufficientLiquidity",
      "msg": "Insufficient liquidity in vault for withdrawal"
    }
  ],
  "types": [
    {
      "name": "initializeVaultParams",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "name",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "platformAccount",
            "type": "pubkey"
          },
          {
            "name": "unstakeLockupPeriod",
            "type": {
              "option": "i64"
            }
          },
          {
            "name": "managementFee",
            "type": {
              "option": "u64"
            }
          },
          {
            "name": "minStakeAmount",
            "type": {
              "option": "u64"
            }
          },
          {
            "name": "maxTotalAssets",
            "type": {
              "option": "u64"
            }
          }
        ]
      }
    },
    {
      "name": "unstakeRequest",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "shares",
            "docs": [
              "Number of shares to unstake"
            ],
            "type": "u64"
          },
          {
            "name": "requestTime",
            "docs": [
              "When the unstake request was made"
            ],
            "type": "i64"
          },
          {
            "name": "assetPerShareAtRequest",
            "docs": [
              "Asset amount per share at request time (scaled by PRECISION)"
            ],
            "type": "u128"
          }
        ]
      }
    },
    {
      "name": "updateVaultConfigParams",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "unstakeLockupPeriod",
            "type": {
              "option": "i64"
            }
          },
          {
            "name": "managementFee",
            "type": {
              "option": "u64"
            }
          },
          {
            "name": "minStakeAmount",
            "type": {
              "option": "u64"
            }
          },
          {
            "name": "maxTotalAssets",
            "type": {
              "option": "u64"
            }
          },
          {
            "name": "isPaused",
            "type": {
              "option": "bool"
            }
          },
          {
            "name": "platformAccount",
            "type": {
              "option": "pubkey"
            }
          }
        ]
      }
    },
    {
      "name": "vault",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "name",
            "docs": [
              "The name of the vault"
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "pubkey",
            "docs": [
              "The vault's pubkey"
            ],
            "type": "pubkey"
          },
          {
            "name": "owner",
            "docs": [
              "The owner/admin of the vault"
            ],
            "type": "pubkey"
          },
          {
            "name": "platformAccount",
            "docs": [
              "The platform account for receiving 50% of rewards"
            ],
            "type": "pubkey"
          },
          {
            "name": "tokenMint",
            "docs": [
              "The token mint for staking"
            ],
            "type": "pubkey"
          },
          {
            "name": "vaultTokenAccount",
            "docs": [
              "The vault token account (main asset pool)"
            ],
            "type": "pubkey"
          },
          {
            "name": "totalShares",
            "docs": [
              "Total supply of shares"
            ],
            "type": "u64"
          },
          {
            "name": "totalAssets",
            "docs": [
              "Total assets in the vault"
            ],
            "type": "u64"
          },
          {
            "name": "totalRewards",
            "docs": [
              "Total rewards distributed"
            ],
            "type": "u64"
          },
          {
            "name": "rewardsPerShare",
            "docs": [
              "Rewards per share (scaled by SHARE_PRECISION)"
            ],
            "type": "u128"
          },
          {
            "name": "lastRewardsUpdate",
            "docs": [
              "Last time rewards were updated"
            ],
            "type": "i64"
          },
          {
            "name": "unstakeLockupPeriod",
            "docs": [
              "Unstake lockup period in seconds"
            ],
            "type": "i64"
          },
          {
            "name": "managementFee",
            "docs": [
              "Platform share percentage for add_rewards (in basis points)"
            ],
            "type": "u64"
          },
          {
            "name": "minStakeAmount",
            "docs": [
              "Minimum stake amount"
            ],
            "type": "u64"
          },
          {
            "name": "maxTotalAssets",
            "docs": [
              "Maximum total assets"
            ],
            "type": "u64"
          },
          {
            "name": "isPaused",
            "docs": [
              "Whether the vault is paused"
            ],
            "type": "bool"
          },
          {
            "name": "createdAt",
            "docs": [
              "Vault creation timestamp"
            ],
            "type": "i64"
          },
          {
            "name": "sharesBase",
            "docs": [
              "Shares base for rebase tracking"
            ],
            "type": "u32"
          },
          {
            "name": "rebaseVersion",
            "docs": [
              "Current rebase version for tracking"
            ],
            "type": "u32"
          },
          {
            "name": "ownerShares",
            "docs": [
              "Owner shares (owner as a normal depositor)"
            ],
            "type": "u64"
          },
          {
            "name": "pendingUnstakeShares",
            "docs": [
              "Total shares pending unstake (not participating in rewards)"
            ],
            "type": "u64"
          },
          {
            "name": "reservedAssets",
            "docs": [
              "Assets reserved for pending unstake requests (frozen assets)"
            ],
            "type": "u64"
          },
          {
            "name": "bump",
            "docs": [
              "Bump seed for PDA"
            ],
            "type": "u8"
          },
          {
            "name": "reserved",
            "docs": [
              "Reserved for future use"
            ],
            "type": {
              "array": [
                "u8",
                16
              ]
            }
          }
        ]
      }
    },
    {
      "name": "vaultDepositor",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "vault",
            "docs": [
              "The vault this depositor belongs to"
            ],
            "type": "pubkey"
          },
          {
            "name": "authority",
            "docs": [
              "The depositor's authority"
            ],
            "type": "pubkey"
          },
          {
            "name": "shares",
            "docs": [
              "The depositor's shares"
            ],
            "type": "u64"
          },
          {
            "name": "rewardsDebt",
            "docs": [
              "The depositor's rewards debt (for reward calculation)"
            ],
            "type": "u128"
          },
          {
            "name": "lastRewardsClaim",
            "docs": [
              "Last time rewards were claimed"
            ],
            "type": "i64"
          },
          {
            "name": "unstakeRequest",
            "docs": [
              "Unstake request"
            ],
            "type": {
              "defined": {
                "name": "unstakeRequest"
              }
            }
          },
          {
            "name": "totalStaked",
            "docs": [
              "Total amount staked"
            ],
            "type": "u64"
          },
          {
            "name": "totalUnstaked",
            "docs": [
              "Total amount unstaked"
            ],
            "type": "u64"
          },
          {
            "name": "totalRewardsClaimed",
            "docs": [
              "Total rewards claimed"
            ],
            "type": "u64"
          },
          {
            "name": "createdAt",
            "docs": [
              "When the depositor was created"
            ],
            "type": "i64"
          },
          {
            "name": "lastRebaseVersion",
            "docs": [
              "Last rebase version user has synced with"
            ],
            "type": "u32"
          },
          {
            "name": "lastStakeTime",
            "docs": [
              "Last time user staked (for MEV protection)"
            ],
            "type": "i64"
          },
          {
            "name": "reserved",
            "docs": [
              "Reserved for future use"
            ],
            "type": {
              "array": [
                "u64",
                6
              ]
            }
          }
        ]
      }
    }
  ]
};
