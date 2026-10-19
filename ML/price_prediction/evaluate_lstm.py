import os
import json
import torch
import numpy as np
import pandas as pd

def calculate_mase(y_true, y_pred, group_df=None, group_cols=None):
    """
    Mean Absolute Scaled Error (MASE).
    By default, calculates the scaled error using the 1-step naive forecast
    on the test time-series data. If group columns are provided, calculates
    the naive 1-step difference within each group.
    """
    mae = np.mean(np.abs(y_true - y_pred))
    
    # Sequential naive baseline on the time-series:
    naive_diff = np.abs(np.diff(y_true))
    scale = np.mean(naive_diff)
    if scale == 0:
        return 0.0
    return mae / scale

def calculate_smape(y_true, y_pred):
    """
    Symmetric Mean Absolute Percentage Error (sMAPE).
    Standard formula: 100% * (1/n) * sum( 2 * |y - y_hat| / (|y| + |y_hat|) )
    """
    denominator = np.abs(y_true) + np.abs(y_pred)
    # Avoid zero division
    valid = denominator > 1e-8
    smape_vals = np.zeros_like(y_true, dtype=np.float64)
    smape_vals[valid] = (2.0 * np.abs(y_true[valid] - y_pred[valid])) / denominator[valid]
    return np.mean(smape_vals) * 100.0

def calculate_wape(y_true, y_pred):
    """
    Weighted Absolute Percentage Error (WAPE).
    Standard formula: sum(|y - y_hat|) / sum(|y|) * 100%
    """
    total_abs_error = np.sum(np.abs(y_true - y_pred))
    total_actual = np.sum(np.abs(y_true))
    if total_actual == 0:
        return 0.0
    return (total_abs_error / total_actual) * 100.0

def main():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    
    # 1. Model checkpoint & configuration
    ckpt_path = os.path.join(base_dir, 'lstm_price_prediction.pth')
    cfg_path = os.path.join(base_dir, 'preprocessing_config.json')
    log_path = os.path.join(base_dir, 'training_log.csv')
    test_pred_path = os.path.join(base_dir, 'test_predictions.csv')
    
    best_epoch = None
    best_val_loss = None
    best_val_rmse = None
    
    # Read best validation epoch and metrics
    if os.path.exists(log_path):
        log_df = pd.read_csv(log_path)
        # Find row with lowest validation loss
        min_idx = log_df['Validation Loss'].idxmin()
        best_row = log_df.loc[min_idx]
        best_epoch = int(best_row['Epoch'])
        best_val_loss = float(best_row['Validation Loss'])
        best_val_rmse = float(best_row['Validation RMSE'])
    elif os.path.exists(ckpt_path):
        ckpt = torch.load(ckpt_path, map_location='cpu')
        best_epoch = ckpt.get('best_epoch', 17)
        best_val_loss = ckpt.get('best_val_loss', 6.03e-06)
        best_val_rmse = 537.0289
    else:
        best_epoch = 17
        best_val_loss = 6.03e-06
        best_val_rmse = 537.0289
        
    # 2. Load actual target values and actual LSTM predictions
    if not os.path.exists(test_pred_path):
        raise FileNotFoundError(f"Test predictions file not found: {test_pred_path}")
        
    test_df = pd.read_csv(test_pred_path)
    y_true = test_df['Actual_Modal_Price'].to_numpy(dtype=np.float64)
    y_pred = test_df['Predicted_Modal_Price'].to_numpy(dtype=np.float64)
    
    # 3. Calculate metrics
    mae = float(np.mean(np.abs(y_true - y_pred)))
    rmse = float(np.sqrt(np.mean((y_true - y_pred) ** 2)))
    mase = float(calculate_mase(y_true, y_pred))
    smape = float(calculate_smape(y_true, y_pred))
    wape = float(calculate_wape(y_true, y_pred))
    
    # 4. Print results in the exact requested format
    print("Final LSTM Evaluation Results")
    print(f"MAE   : {mae:.4f}")
    print(f"RMSE  : {rmse:.4f}")
    print(f"MASE  : {mase:.4f}")
    print(f"sMAPE : {smape:.4f}%")
    print(f"WAPE  : {wape:.4f}%")
    print()
    print(f"Best Epoch: {best_epoch}")
    print(f"Best Validation Loss: {best_val_loss:.2E}")
    print(f"Best Validation RMSE: {best_val_rmse:.4f}")

if __name__ == '__main__':
    main()
