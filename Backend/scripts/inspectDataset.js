const path = require("path");
const parquet = require("parquetjs-lite");

async function inspect() {
    const filePath = path.join(
        __dirname,
        "..",
        "..",
        "Datasets",
        "Agricultural Market Price Dataset",
        "feature_engineered_dataset",
        "tomato.parquet"
    );

    const reader = await parquet.ParquetReader.openFile(filePath);
    const cursor = reader.getCursor();

    for (let i = 0; i < 5; i++) {
        const record = await cursor.next();
        if (!record) break;
        console.log(record);
    }

    await reader.close();
}

inspect();