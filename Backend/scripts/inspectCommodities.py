import pyarrow.dataset as ds

dataset = ds.dataset(
    "../Datasets/Agricultural Market Price Dataset/cleaned_dataset",
    format="parquet"
)

commodities = set()

for batch in dataset.to_batches(
    columns=["Commodity"],
    batch_size=100000
):
    for value in batch.column("Commodity").to_pylist():
        if value:
            commodities.add(value)

print("Total unique commodities:", len(commodities))

for commodity in sorted(commodities):
    print(commodity)