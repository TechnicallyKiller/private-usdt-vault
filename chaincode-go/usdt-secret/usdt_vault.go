package main

import (
    "encoding/json"
    "fmt"
    "log"

    "github.com/hyperledger/fabric-contract-api-go/contractapi"
)

type SmartContract struct {
    contractapi.Contract
}

type Asset struct {
    ID    string  `json:"id"`
    Value float64 `json:"value"`
}


func (s *SmartContract) Mint(ctx contractapi.TransactionContextInterface) error {
    asset := Asset{ID: "reserve_total", Value: 2.500000}
    assetJSON, err := json.Marshal(asset)
    if err != nil { return err }

    // Store in private collection
    err = ctx.GetStub().PutPrivateData("USDTSecretCollection", "reserve_total", assetJSON)
    if err != nil { return fmt.Errorf("failed to put private data: %v", err) }

    return nil
}


func (s *SmartContract) ReadBalance(ctx contractapi.TransactionContextInterface) (*Asset, error) {

    assetJSON, err := ctx.GetStub().GetPrivateData("USDTSecretCollection", "reserve_total")
    if err != nil { return nil, fmt.Errorf("failed to read private data: %v", err) }
    if assetJSON == nil { return nil, fmt.Errorf("Asset not found or you are NOT authorized") }

    var asset Asset
    err = json.Unmarshal(assetJSON, &asset)
    return &asset, err
}

func main() {
    assetChaincode, err := contractapi.NewChaincode(&SmartContract{})
    if err != nil { log.Panicf("Error creating chaincode: %v", err) }
    if err := assetChaincode.Start(); err != nil { log.Panicf("Error starting chaincode: %v", err) }
}