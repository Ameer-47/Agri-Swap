import pyarrow.dataset as ds
import pyarrow.compute as pc

dataset = ds.dataset(
    "../Datasets/Agricultural Market Price Dataset/cleaned_dataset",
    format="parquet"
)

table = dataset.to_table(
    columns=["Commodity"]
)

unique_values = pc.unique(table["Commodity"])

print("Total unique commodities:", len(unique_values))

for value in sorted(unique_values.to_pylist()):
    print(value)