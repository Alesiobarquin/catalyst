package com.catalyst.engine.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;
import java.time.Instant;
import java.util.Collections;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

class MarketDataServiceTest {
    @Test
    void encodedVixSymbolProducesAnActualFreshRegime() {
        var builder = RestClient.builder();
        var server = MockRestServiceServer.bindTo(builder).build();
        server.expect(requestTo("https://query1.finance.yahoo.com/v8/finance/chart/SPY?range=1d&interval=1d"))
                .andRespond(withSuccess("{\"chart\":{\"result\":[{\"meta\":{\"regularMarketPrice\":500}}]}}", MediaType.APPLICATION_JSON));
        String closes = String.join(",", Collections.nCopies(200, "480"));
        server.expect(requestTo("https://query1.finance.yahoo.com/v8/finance/chart/SPY?range=1y&interval=1d"))
                .andRespond(withSuccess("{\"chart\":{\"result\":[{\"indicators\":{\"quote\":[{\"close\":[" + closes + "]}]}}]}}", MediaType.APPLICATION_JSON));
        server.expect(requestTo("https://query1.finance.yahoo.com/v8/finance/chart/%5EVIX?range=1d&interval=1d"))
                .andRespond(withSuccess("{\"chart\":{\"result\":[{\"meta\":{\"regularMarketPrice\":20}}]}}", MediaType.APPLICATION_JSON));
        var service = new MarketDataService(new ObjectMapper(), builder.build());
        service.refreshRegimeData();
        var snapshot = service.getMarketSnapshot();
        assertEquals(20, snapshot.getVix());
        assertEquals(480, snapshot.getSpy200Sma());
        assertTrue(snapshot.getCapturedAt().isAfter(Instant.now().minusSeconds(5)));
        server.verify();
    }
}
