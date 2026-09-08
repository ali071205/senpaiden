// ============================================================
// fast_checker.cpp — High-concurrency C++ URL and Image Slice Checker
// Uses native Win32 multithreading and WinINet HTTP API for zero-dependency execution.
// ============================================================

#include <windows.h>
#include <wininet.h>
#include <iostream>
#include <vector>
#include <string>
#include <chrono>
#include <algorithm>
#include <numeric>
#include <cstdlib>

struct CheckResult {
    std::string url;
    int status_code;
    double latency_ms;
    bool is_valid;
};

struct WorkerContext {
    HINTERNET hSession;
    int timeout_ms;
};

CRITICAL_SECTION g_csQueue;
CRITICAL_SECTION g_csResults;
std::vector<std::string> g_urls_queue;
std::vector<CheckResult> g_results;

DWORD WINAPI WorkerThreadProc(LPVOID lpParam) {
    WorkerContext* ctx = reinterpret_cast<WorkerContext*>(lpParam);
    HINTERNET hSession = ctx->hSession;

    while (true) {
        std::string url;
        EnterCriticalSection(&g_csQueue);
        if (g_urls_queue.empty()) {
            LeaveCriticalSection(&g_csQueue);
            break;
        }
        url = g_urls_queue.back();
        g_urls_queue.pop_back();
        LeaveCriticalSection(&g_csQueue);

        auto start = std::chrono::high_resolution_clock::now();
        int status_code = 0;
        bool is_valid = false;

        DWORD flags = INTERNET_FLAG_RELOAD | INTERNET_FLAG_NO_CACHE_WRITE | INTERNET_FLAG_SECURE;
        HINTERNET hUrl = InternetOpenUrlA(hSession, url.c_str(), NULL, 0, flags, 0);

        if (hUrl) {
            DWORD dwStatusCode = 0;
            DWORD dwSize = sizeof(dwStatusCode);
            if (HttpQueryInfoA(hUrl, HTTP_QUERY_STATUS_CODE | HTTP_QUERY_FLAG_NUMBER, &dwStatusCode, &dwSize, NULL)) {
                status_code = static_cast<int>(dwStatusCode);
                is_valid = (status_code == 200 || status_code == 206);
            }
            InternetCloseHandle(hUrl);
        }

        auto end = std::chrono::high_resolution_clock::now();
        double latency = std::chrono::duration<double, std::milli>(end - start).count();

        EnterCriticalSection(&g_csResults);
        g_results.push_back({url, status_code, latency, is_valid});
        LeaveCriticalSection(&g_csResults);
    }
    return 0;
}

int main(int argc, char* argv[]) {
    int num_threads = 16;
    int timeout_ms = 5000;

    if (argc > 1) {
        num_threads = std::max(1, std::atoi(argv[1]));
    }

    InitializeCriticalSection(&g_csQueue);
    InitializeCriticalSection(&g_csResults);

    // Read URLs from standard input until EOF
    std::string line;
    while (std::getline(std::cin, line)) {
        while (!line.empty() && (line.back() == '\r' || line.back() == '\n' || line.back() == ' ')) {
            line.pop_back();
        }
        if (!line.empty()) {
            g_urls_queue.push_back(line);
        }
    }

    size_t total_urls = g_urls_queue.size();
    if (total_urls == 0) {
        std::cout << "{\"total_urls\":0,\"successful_count\":0,\"failed_count\":0,\"total_duration_sec\":0.0,\"throughput_rps\":0.0,\"engine\":\"cpp_wininet\"}" << std::endl;
        DeleteCriticalSection(&g_csQueue);
        DeleteCriticalSection(&g_csResults);
        return 0;
    }

    HINTERNET hSession = InternetOpenA("SenpaiDenFastChecker/1.0",
                                       INTERNET_OPEN_TYPE_PRECONFIG,
                                       NULL, NULL, 0);
    if (!hSession) {
        std::cerr << "{\"error\":\"Failed to initialize WinINet session\"}" << std::endl;
        DeleteCriticalSection(&g_csQueue);
        DeleteCriticalSection(&g_csResults);
        return 1;
    }

    InternetSetOptionA(hSession, INTERNET_OPTION_CONNECT_TIMEOUT, &timeout_ms, sizeof(timeout_ms));
    InternetSetOptionA(hSession, INTERNET_OPTION_RECEIVE_TIMEOUT, &timeout_ms, sizeof(timeout_ms));

    WorkerContext ctx = { hSession, timeout_ms };

    auto overall_start = std::chrono::high_resolution_clock::now();

    int effective_threads = std::min(num_threads, static_cast<int>(total_urls));
    std::vector<HANDLE> hThreads;
    for (int i = 0; i < effective_threads; ++i) {
        HANDLE h = CreateThread(NULL, 0, WorkerThreadProc, &ctx, 0, NULL);
        if (h) {
            hThreads.push_back(h);
        }
    }

    if (!hThreads.empty()) {
        WaitForMultipleObjects(static_cast<DWORD>(hThreads.size()), hThreads.data(), TRUE, INFINITE);
        for (HANDLE h : hThreads) {
            CloseHandle(h);
        }
    }

    auto overall_end = std::chrono::high_resolution_clock::now();
    double total_sec = std::chrono::duration<double>(overall_end - overall_start).count();

    InternetCloseHandle(hSession);
    DeleteCriticalSection(&g_csQueue);
    DeleteCriticalSection(&g_csResults);

    // Compute metrics
    int successes = 0;
    std::vector<double> latencies;
    for (size_t i = 0; i < g_results.size(); ++i) {
        if (g_results[i].is_valid) successes++;
        latencies.push_back(g_results[i].latency_ms);
    }

    std::sort(latencies.begin(), latencies.end());
    double avg_lat = 0.0;
    if (!latencies.empty()) {
        avg_lat = std::accumulate(latencies.begin(), latencies.end(), 0.0) / latencies.size();
    }

    double p50 = latencies.empty() ? 0.0 : latencies[latencies.size() * 0.50];
    double p95 = latencies.empty() ? 0.0 : latencies[std::min<size_t>(latencies.size() * 0.95, latencies.size() - 1)];
    double p99 = latencies.empty() ? 0.0 : latencies[std::min<size_t>(latencies.size() * 0.99, latencies.size() - 1)];
    double rps = total_sec > 0.0 ? (total_urls / total_sec) : 0.0;

    std::cout << "{"
              << "\"total_urls\":" << total_urls << ","
              << "\"successful_count\":" << successes << ","
              << "\"failed_count\":" << (total_urls - successes) << ","
              << "\"total_duration_sec\":" << total_sec << ","
              << "\"throughput_rps\":" << rps << ","
              << "\"avg_latency_ms\":" << avg_lat << ","
              << "\"p50_latency_ms\":" << p50 << ","
              << "\"p95_latency_ms\":" << p95 << ","
              << "\"p99_latency_ms\":" << p99 << ","
              << "\"engine\":\"cpp_wininet\""
              << "}" << std::endl;

    return 0;
}
