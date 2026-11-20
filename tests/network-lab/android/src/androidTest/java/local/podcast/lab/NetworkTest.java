package local.podcast.lab;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.fail;

import java.io.InterruptedIOException;
import java.net.Proxy;
import java.util.concurrent.TimeUnit;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import org.json.JSONObject;
import org.junit.Test;

public class NetworkTest {
    private final OkHttpClient client = new OkHttpClient.Builder()
            .proxy(Proxy.NO_PROXY)
            .followRedirects(false)
            .retryOnConnectionFailure(false)
            .callTimeout(2, TimeUnit.SECONDS)
            .build();

    @Test public void sharedMockContract() throws Exception {
        check("/json", 200);
        check("/gzip", 200);
        check("/auth", 401);
        check("/limit", 429);
    }

    @Test public void slowResponseTimesOut() throws Exception {
        Request request = new Request.Builder().url("http://10.0.2.2:17651/slow").build();
        try (Response response = client.newCall(request).execute()) {
            fail("Expected timeout, got status " + response.code());
        } catch (InterruptedIOException expected) {
            // The Mock intentionally responds after OkHttp's call deadline.
        }
    }

    private void check(String path, int code) throws Exception {
        Request request = new Request.Builder().url("http://10.0.2.2:17651" + path).build();
        try (Response response = client.newCall(request).execute()) {
            assertEquals(code, response.code());
            assertEquals("播客测试", new JSONObject(response.body().string()).getString("message"));
            if (code == 429) assertEquals("30", response.header("Retry-After"));
        }
    }
}
